import { createApp, toNodeListener, eventHandler, H3Event, readRawBody, getRequestURL } from 'h3';
import { createServer } from 'http';

const app = createApp();

app.use(
  eventHandler(async (event: H3Event) => {
    const url = getRequestURL(event);
    function copyHeader(headerName: string, to: Headers, from: Headers) {
      const hdrVal = from.get(headerName);
      if (hdrVal) {
        to.set(headerName, hdrVal);
      }
    }

    if (event.method === 'OPTIONS') {
      const response = new Response('', {
        status: 200,
        headers: new Headers({
          'Access-Control-Allow-Origin': event.headers.get('origin') || '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Allow-Headers':
            'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-goog-visitor-id, x-goog-api-key, x-origin, x-youtube-client-version, x-youtube-client-name, x-goog-api-format-version, x-user-agent, Accept-Language, Range, Referer, Cookie',
          'Access-Control-Max-Age': '86400',
          'Access-Control-Allow-Credentials': 'true',
        }),
      });
      return response;
    }

    if (!url.searchParams.has('__host')) {
      return new Response(
        'Request is formatted incorrectly. Please include __host in the query string.',
        { status: 400 },
      );
    }

    url.host = url.searchParams.get('__host')!;
    url.protocol = 'https';
    url.port = '443';
    url.pathname = url.pathname.replace(/^\/api\/proxy\//, '/');
    url.searchParams.delete('__host');

    const headersBase64 = url.searchParams.get('__headers');
    let parsedHeaders = {};
    if (headersBase64) {
      try {
        parsedHeaders = JSON.parse(atob(headersBase64));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        try {
          parsedHeaders = JSON.parse(headersBase64);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          return new Response(
            'Request is formatted incorrectly. The __headers query must be formatted as JSON or Base64.',
            { status: 400 },
          );
        }
      }
    }
    const request_headers = new Headers(parsedHeaders);

    copyHeader('range', request_headers, event.headers);

    if (!request_headers.has('user-agent'))
      copyHeader('user-agent', request_headers, event.headers);

    url.searchParams.delete('__headers');

    if (url.host.includes('youtube')) {
      request_headers.set('origin', 'https://www.youtube.com');
      request_headers.set('referer', 'https://www.youtube.com/');
    }

    if (event.headers.has('Authorization')) {
      request_headers.set('Authorization', event.headers.get('Authorization')!);
    }
    const body
      = event.method !== 'GET' && event.method !== 'HEAD'
        ? await readRawBody(event)
        : undefined;

    const fetchRes = await fetch(url, {
      method: event.method,
      headers: request_headers,
      body: body,
    });

    const headers = new Headers();
    copyHeader('content-type', headers, fetchRes.headers);
    copyHeader('content-disposition', headers, fetchRes.headers);
    copyHeader('accept-ranges', headers, fetchRes.headers);
    copyHeader('content-range', headers, fetchRes.headers);

    headers.set(
      'Access-Control-Allow-Origin',
      event.headers.get('origin') || '*',
    );
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Access-Control-Allow-Methods', '*');
    headers.set('Access-Control-Allow-Credentials', 'true');

    return new Response(fetchRes.body, {
      status: fetchRes.status,
      headers: headers,
    });
  }),
);

createServer(toNodeListener(app)).listen(3643, () => {
  console.log('Server running on http://localhost:3643');
});
