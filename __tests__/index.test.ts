import { Fetcher } from "@cloudflare/workers-types/experimental/index.js";
import { describe, it, vi } from "vitest";
import { generateRedirectsEvaluator } from "../src/index.js";

describe("redirects-in-workers", () => {
	const redirectsFileContents = `
/foo /bar
/cat /dog 301
/search /new-search?query
/proxy /proxy-me 200
/proxy-and-search /proxy-me?query 200
`;

	const redirectsEvaluator = generateRedirectsEvaluator(redirectsFileContents);

	const generateMockBinding = () => {
		const mockFetch = vi.fn();
		return {
			mockFetch,
			binding: {
				fetch: mockFetch,
			} as unknown as Fetcher,
		};
	};

	it("should serve redirects when they match", async ({ expect }) => {
		const { binding, mockFetch } = generateMockBinding();
		const response = await redirectsEvaluator(
			new Request("http://fakehost/foo"),
			binding,
		);
		expect(response?.status).toEqual(302);
		expect(response?.headers.get("Location")).toEqual("/bar");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should serve redirects with a custom status code when they match", async ({
		expect,
	}) => {
		const { binding, mockFetch } = generateMockBinding();
		const response = await redirectsEvaluator(
			new Request("http://fakehost/cat"),
			binding,
		);
		expect(response?.status).toEqual(301);
		expect(response?.headers.get("Location")).toEqual("/dog");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should serve redirects and retain the search params when they match", async ({
		expect,
	}) => {
		const { binding, mockFetch } = generateMockBinding();
		const response = await redirectsEvaluator(
			new Request("http://fakehost/foo?search"),
			binding,
		);
		expect(response?.status).toEqual(302);
		expect(response?.headers.get("Location")).toEqual("/bar?search");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should serve redirects and prefer destination search params when present", async ({
		expect,
	}) => {
		const { binding, mockFetch } = generateMockBinding();
		const response = await redirectsEvaluator(
			new Request("http://fakehost/search?search"),
			binding,
		);
		expect(response?.status).toEqual(302);
		expect(response?.headers.get("Location")).toEqual("/new-search?query");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should return null when no redirect matches", async ({ expect }) => {
		const { binding, mockFetch } = generateMockBinding();
		const response = await redirectsEvaluator(
			new Request("http://fakehost/non-existent"),
			binding,
		);
		expect(response).toBeNull();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should proxy", async ({ expect }) => {
		const { binding, mockFetch } = generateMockBinding();
		mockFetch.mockResolvedValueOnce(new Response("Hello, world!"));
		const response = await redirectsEvaluator(
			new Request("http://fakehost/proxy"),
			binding,
		);
		console.log(response);
		expect(response?.status).toEqual(200);
		expect(await response?.text()).toEqual("Hello, world!");
		expect(mockFetch.mock.calls[0][0].url).toEqual("http://fakehost/proxy-me");
	});

	it("should proxy and retain the search params when they match", async ({
		expect,
	}) => {
		const { binding, mockFetch } = generateMockBinding();
		mockFetch.mockResolvedValueOnce(new Response("Hello, world!"));
		const response = await redirectsEvaluator(
			new Request("http://fakehost/proxy?search"),
			binding,
		);
		console.log(response);
		expect(response?.status).toEqual(200);
		expect(await response?.text()).toEqual("Hello, world!");
		expect(mockFetch.mock.calls[0][0].url).toEqual(
			"http://fakehost/proxy-me?search",
		);
	});

	// TODO: Bug in @cloudflare/pages-shared?
	it("should proxy and ignore destination search params when present", async ({
		expect,
	}) => {
		const { binding, mockFetch } = generateMockBinding();
		mockFetch.mockResolvedValueOnce(new Response("Hello, world!"));
		const response = await redirectsEvaluator(
			new Request("http://fakehost/proxy-and-search?search"),
			binding,
		);
		console.log(response);
		expect(response?.status).toEqual(200);
		expect(await response?.text()).toEqual("Hello, world!");
		expect(mockFetch.mock.calls[0][0].url).toEqual(
			"http://fakehost/proxy-me?search",
		);
	});
});
