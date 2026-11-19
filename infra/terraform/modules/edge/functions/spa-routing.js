// SPA routing for the default behavior (architecture.md §4).
// A path whose last segment has no file extension (e.g. /r/aZ3kP9qL2mXw) is served as /index.html.
// Only attached to the default behavior, so /media/* 403 responses are never rewritten.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
