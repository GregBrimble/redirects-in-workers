import {
	FoundResponse,
	MovedPermanentlyResponse,
	PermanentRedirectResponse,
	SeeOtherResponse,
	TemporaryRedirectResponse,
} from "@cloudflare/pages-shared/asset-server/responses.js";
import {
	generateRulesMatcher,
	replacer,
} from "@cloudflare/pages-shared/asset-server/rulesEngine.js";
import { createMetadataObject } from "@cloudflare/pages-shared/metadata-generator/createMetadataObject.js";
import { parseRedirects } from "@cloudflare/pages-shared/metadata-generator/parseRedirects.js";
import type { Fetcher } from "@cloudflare/workers-types/experimental";

const REDIRECTS_VERSION = 1;

export const generateRedirectsEvaluator = (
	redirectsFileContents: string,
): ((request: Request, assetsBinding: Fetcher) => Promise<Response | null>) => {
	const redirects = parseRedirects(redirectsFileContents);
	const metadata = createMetadataObject({
		redirects,
		logger: {
			debug: console.debug,
			log: console.log,
			info: console.info,
			warn: console.warn,
			error: console.error,
		},
	});
	const staticRules =
		metadata.redirects?.version === REDIRECTS_VERSION
			? metadata.redirects.staticRules || {}
			: {};

	return async (request: Request, assetsBinding: Fetcher) => {
		const url = new URL(request.url);
		const search = url.search;
		let { pathname } = new URL(request.url);

		const staticRedirectsMatcher = () => {
			return staticRules[pathname];
		};

		const generateRedirectsMatcher = () =>
			generateRulesMatcher(
				metadata.redirects?.version === REDIRECTS_VERSION
					? metadata.redirects.rules
					: {},
				({ status, to }, replacements) => ({
					status,
					to: replacer(to, replacements),
				}),
			);

		const match =
			staticRedirectsMatcher() || generateRedirectsMatcher()({ request })[0];

		if (match) {
			if (match.status === 200) {
				// A 200 redirect means that we are proxying to a different asset, for example,
				// a request with url /users/12345 could be pointed to /users/id.html. In order to
				// do this, we overwrite the pathname, and instead match for assets with that url,
				// and importantly, do not use the regular redirect handler - as the url visible to
				// the user does not change
				pathname = new URL(match.to, request.url).pathname;

				return assetsBinding.fetch(
					new Request(new URL(pathname + search, request.url), { ...request }),
				);
			} else {
				const { status, to } = match;
				const destination = new URL(to, request.url);
				const location =
					destination.origin === new URL(request.url).origin
						? `${destination.pathname}${destination.search || search}${
								destination.hash
							}`
						: `${destination.href.slice(
								0,
								destination.href.length -
									(destination.search.length + destination.hash.length),
							)}${destination.search ? destination.search : search}${
								destination.hash
							}`;

				switch (status) {
					case 301:
						return new MovedPermanentlyResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 303:
						return new SeeOtherResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 307:
						return new TemporaryRedirectResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 308:
						return new PermanentRedirectResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 302:
					default:
						return new FoundResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
				}
			}
		}

		return null;
	};
};
