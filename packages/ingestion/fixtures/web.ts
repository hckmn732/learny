// Deterministic public page used by the web extractor tests and the SPEC-510 demonstration.
// The navigation, header and footer carry sentinel words that must never reach a passage (CA-1).

export const WEB_FIXTURE_URL = 'https://fixture.learny.test/comptabilite/compte-de-resultat';

export const WEB_FIXTURE_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <title>Comptabilité de gestion — le compte de résultat</title>
    <meta property="og:site_name" content="Learnothèque">
    <script>window.analytics = "navigation-script";</script>
    <style>body { color: red; }</style>
  </head>
  <body>
    <header><p>Navigation d’en-tête à ignorer</p></header>
    <nav><a href="/">Accueil navigation</a><a href="/cours">Cours navigation</a></nav>
    <main>
      <article>
        <h1 id="compte-resultat">Le compte de résultat</h1>
        <p>Le compte de résultat présente les charges et les produits d’un exercice comptable.</p>
        <p>Il se lit en trois niveaux : exploitation, financier et exceptionnel.</p>
        <h2 id="marge-brute">La marge brute</h2>
        <p>La marge brute est la différence entre le chiffre d’affaires et le coût des marchandises vendues.</p>
        <div id="resultat-net">
          <p>Le résultat net tient compte de l’impôt sur les sociétés et du résultat financier.</p>
          <ul>
            <li>Le résultat d’exploitation précède le résultat financier.</li>
            <li>Le résultat net clôture le compte de résultat.</li>
          </ul>
        </div>
      </article>
    </main>
    <aside><p>Publicité à ignorer</p></aside>
    <footer><p>Pied de page navigation à ignorer</p></footer>
  </body>
</html>`;
