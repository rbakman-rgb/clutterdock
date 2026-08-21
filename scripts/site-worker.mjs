// Serves website/ as static assets; all hosts except the canonical one
// (clutterdock.app, www.*, *.workers.dev) 301 to https://clutterdock.com.
const CANONICAL_HOST = "clutterdock.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== CANONICAL_HOST) {
      url.hostname = CANONICAL_HOST;
      url.protocol = "https:";
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404 && (request.method === "GET" || request.method === "HEAD")) {
      const page = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
      if (page.ok) {
        return new Response(page.body, {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    }
    return res;
  },
};
// bust 1787330000
