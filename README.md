# MoneyAmplifier

Personal money tracker (spending, budgets, net worth). A static web app / PWA: plain HTML + JavaScript modules, no build step. Data is stored in the browser on your device (localStorage); there is no server.

## Project map
| Path | What it is |
|---|---|
| `index.html` | App shell: top bar, bottom tab bar, loads the scripts |
| `css/styles.css` | All styling. Colours are variables at the top (light + dark mode) |
| `js/app.js` | Router: maps `#/home`, `#/add`, … to a view module |
| `js/store.js` | The data model, saving, import/export. **Add new data fields here** |
| `js/util.js`, `js/components.js` | Helpers and shared UI bits |
| `js/views/*.js` | One file per page: home, add, history, invest, wealth (net worth), settings |
| `sw.js` + `manifest.webmanifest` | Offline support and home-screen install |
| `icons/icon-source.svg` | Your app icon. Replace it, then `npm run icons` |
| `vendor/chart.umd.js` | Chart.js (MIT licence), bundled so it works offline |

## Run locally
```
npm install     # first time only
npm run dev     # http://localhost:5173
npm run icons   # regenerate icon sizes from icons/icon-source.svg|png
```

## Deploy (GitHub Pages)
Push to GitHub, then repo → Settings → Pages → Deploy from branch `main` / root. The site appears at `https://<user>.github.io/<repo>/`.
On the phone: open the URL → Share → Add to Home Screen (iPhone Safari) or menu → Install app (Android Chrome).
After adding a file, add it to `PRECACHE` in `sw.js` and bump `CACHE_NAME`.

The repository is public: never commit private data. Your transactions stay in your own browser.
