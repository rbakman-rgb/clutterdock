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
    return env.ASSETS.fetch(request);
  },
};
