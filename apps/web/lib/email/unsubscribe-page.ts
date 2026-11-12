// French HTML pages of the one-click unsubscribe flow (SPEC-204 EF-5). Static markup, no script,
// the same base tokens as the e-mails; the token is only echoed inside the form action.
import { fr } from '../../messages/fr';

const t = fr.email.unsubscribe;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · Learny</title>
<style>
body{margin:0;padding:32px 16px;background:#F4F4F1;color:#111113;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:24px}
main{max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E6E1;border-radius:24px;padding:32px}
h1{margin:24px 0 12px;font-family:'Space Grotesk',Arial,sans-serif;font-size:24px;line-height:32px}
p{margin:0 0 16px}.muted{color:#62626B;font-size:13px;line-height:20px}
.logo{display:inline-block;width:32px;height:32px;border-radius:10px;background:#C6F432;vertical-align:middle}
.brand{display:inline-block;margin-left:12px;font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;font-weight:700;vertical-align:middle}
button{display:inline-block;min-height:44px;padding:12px 22px;border:0;border-radius:12px;background:#111113;color:#FFFFFF;font:inherit;font-weight:600;cursor:pointer}
a{color:#3A3AA8}
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
export function unsubscribeFormPage(token: string, actionPath: string): string {
  const action = `${actionPath}?token=${encodeURIComponent(token)}`;
  return page(
    t.question,
    `<h1 data-testid="unsubscribe-title">${escapeHtml(t.question)}</h1>
<p>${escapeHtml(t.keep)}</p>
<form method="post" action="${escapeHtml(action)}">
<input type="hidden" name="List-Unsubscribe" value="One-Click">
<button type="submit" data-testid="unsubscribe-confirm">${escapeHtml(t.confirm)}</button>
</form>`,
  );
}

/** After a POST: confirmation of the change. */
export function unsubscribeDonePage(): string {
  return page(
    t.doneTitle,
    `<h1 data-testid="unsubscribe-title">${escapeHtml(t.doneTitle)}</h1>
<p data-testid="unsubscribe-done">${escapeHtml(t.done)}</p>`,
  );
}

/** Altered or unknown token (400). */
export function unsubscribeInvalidPage(): string {
  return page(
    t.invalidTitle,
    `<h1 data-testid="unsubscribe-title">${escapeHtml(t.invalid)}</h1>
<p class="muted">${escapeHtml(t.invalidHint)}</p>`,
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
