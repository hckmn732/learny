// French HTML pages of the one-click unsubscribe flow (SPEC-204 EF-5). Static markup, no script,
// the same base tokens as the e-mails; the token is only echoed inside the form action.
//
// The `<style>` block is stamped with the CSP nonce of the response (SPEC-805): `style-src-elem`
// only admits a nonce, so an anonymous <style> is refused by the browser. The nonce travels on the
// `x-nonce` request header set by the proxy, next to the request CSP header.
import { fr } from '@learny/i18n/fr/email';
import { colors, px } from '@learny/ui/tokens';

import { isValidCspNonce } from '../security/csp';

const t = fr.email.unsubscribe;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** CSP nonce of the response (`x-nonce`), or an empty string; anything malformed is ignored. */
export function requestCspNonce(request: Request): string {
  const nonce = request.headers.get('x-nonce') ?? '';
  return isValidCspNonce(nonce) ? nonce : '';
}

function page(title: string, body: string, nonce: string): string {
  // Only a nonce shaped by `createCspNonce` may reach the attribute: the value is never interpolated
  // as is, so a hostile header cannot close the tag or add an attribute.
  const nonceAttribute = isValidCspNonce(nonce) ? ` nonce="${nonce}"` : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · Learny</title>
<style${nonceAttribute}>
body{margin:0;padding:32px 16px;background:${colors.canvas};color:${colors.ink};font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:${px(15)};line-height:${px(24)}}
main{max-width:${px(600)};margin:0 auto;background:${colors.surface};border:1px solid ${colors.border};border-radius:${px(24)};padding:${px(32)}}
h1{margin:${px(24)} 0 ${px(12)};font-family:'Space Grotesk',Arial,sans-serif;font-size:${px(24)};line-height:${px(32)}}
p{margin:0 0 ${px(16)}}.muted{color:${colors['ink-muted']};font-size:${px(13)};line-height:${px(20)}}
.logo{display:inline-block;width:${px(32)};height:${px(32)};border-radius:${px(10)};background:${colors.lime};vertical-align:middle}
.brand{display:inline-block;margin-left:${px(12)};font-family:'Space Grotesk',Arial,sans-serif;font-size:${px(20)};font-weight:700;vertical-align:middle}
button{display:inline-block;min-height:${px(44)};padding:${px(12)} ${px(22)};border:0;border-radius:${px(12)};background:${colors.ink};color:${colors.white};font:inherit;font-weight:600;cursor:pointer}
a{color:${colors['indigo-ink']}}
</style>
</head>
<body>
<main>
<span class="logo" aria-hidden="true"></span><span class="brand">Learny</span>
${body}
</main>
</body>
</html>
`;
}

/** GET with a valid token: a form, no state change until the learner confirms (CL-6). */
export function unsubscribeFormPage(token: string, actionPath: string, nonce = ''): string {
  const action = `${actionPath}?token=${encodeURIComponent(token)}`;
  return page(
    t.question,
    `<h1 data-testid="unsubscribe-title">${escapeHtml(t.question)}</h1>
<p>${escapeHtml(t.keep)}</p>
<form method="post" action="${escapeHtml(action)}">
<input type="hidden" name="List-Unsubscribe" value="One-Click">
<button type="submit" data-testid="unsubscribe-confirm">${escapeHtml(t.confirm)}</button>
</form>`,
    nonce,
  );
}

/** After a POST: confirmation of the change. */
export function unsubscribeDonePage(nonce = ''): string {
  return page(
    t.doneTitle,
    `<h1 data-testid="unsubscribe-title">${escapeHtml(t.doneTitle)}</h1>
<p data-testid="unsubscribe-done">${escapeHtml(t.done)}</p>`,
    nonce,
  );
}

/** Altered or unknown token (400). */
export function unsubscribeInvalidPage(nonce = ''): string {
  return page(
    t.invalidTitle,
    `<h1 data-testid="unsubscribe-title">${escapeHtml(t.invalid)}</h1>
<p class="muted">${escapeHtml(t.invalidHint)}</p>`,
    nonce,
  );
}

export function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** `Accept: application/json` wins; browsers and mail clients get HTML. */
export function wantsJson(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
}
