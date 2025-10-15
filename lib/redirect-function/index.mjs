function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // 1. Check if the URI already has a file extension (e.g., .html, .css, .js)
    if (uri.includes('.')) {
        return request;
    }

    // 2. Check if the URI is for a root path (e.g., /)
    if (uri.endsWith('/')) {
        // If it's a directory (like /), CloudFront will handle defaultRootObject (index.html)
        return request;
    }

    // 3. For clean URLs like /contact, append .html
    request.uri = uri + '.html';
    return request;
}