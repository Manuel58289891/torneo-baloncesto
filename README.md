# Torneo de Baloncesto

Estadísticas de un torneo: resultados por jornada, balance de equipos, anotadores, MVPs.
Vista pública en `/` y panel de administración en `/admin.html`.

## Probar en tu computadora (sin dependencias, solo Node.js 18+)

    node server.js                                    # http://localhost:3000
    $env:ADMIN_PASSWORD="miclave"; node server.js     # PowerShell, con tu contraseña

Contraseña por defecto en local: `admin123`. Los datos quedan en `data/` (no se sube a git).

## Publicar gratis en GitHub Pages (sin tarjeta, sin número de teléfono extranjero)

Aquí el administrador trabaja en su PC y el público ve un sitio estático.

1. Carga equipos, calendario y resultados con `node server.js` → `http://localhost:3000/admin.html`.
2. Haz doble clic en **`publicar.cmd`** (o `node build-static.js` y luego `git add docs`, `git commit`, `git push`).
   Esto genera la carpeta `docs/` (solo lectura, sin el panel de admin) y la sube a GitHub.
3. Una sola vez, en GitHub: repositorio → **Settings → Pages** → Source: *Deploy from a branch* → rama `main`, carpeta `/docs`.
4. El enlace será `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`. Cada vez que cambies resultados, repite el paso 2.

Ojo: el repositorio debe ser **público** (GitHub Pages gratis lo exige y GitHub en Cuba solo permite repos públicos), y `docs/data.json` queda visible para cualquiera. La contraseña de admin no se sube nunca.

## Publicar gratis en Vercel

La carpeta `api/` son funciones de Vercel y `public/` la página. Los datos viven en Upstash Redis (plan gratuito).

1. Sube este proyecto a un repositorio de GitHub.
2. En vercel.com → **Add New → Project** → importa el repositorio. Framework: **Other**. Deja los comandos de build vacíos.
3. En el proyecto de Vercel: **Storage → Create Database / Marketplace → Upstash Redis** (plan Free) y conéctalo al proyecto.
   Esto crea solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
4. En **Settings → Environment Variables** agrega `ADMIN_PASSWORD` con tu contraseña de administrador.
5. **Redeploy** (Deployments → ⋯ → Redeploy). Listo: comparte el enlace `https://tu-proyecto.vercel.app`; tú entras por `/admin.html`.

Notas:
- En producción no hay contraseña por defecto: si falta `ADMIN_PASSWORD`, nadie puede entrar al admin.
- La vista pública se cachea 10 s en el CDN, así que muchos visitantes casi no gastan el plan gratuito.
- Cambiar `ADMIN_PASSWORD` cierra las sesiones de admin abiertas.

## Cómo se elige el MVP

- MVP del partido: del equipo ganador, mayor valoración (pts + 0.7·reb + 0.7·ast).
- MVP de la jornada: mayor suma de valoración en la jornada + 5 por partido ganado.
- Los pesos están en `public/stats.js`.
