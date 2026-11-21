// Vista previa al compartir (Facebook, WhatsApp, etc.): anuncios, canales, emisoras y secciones.
// Los rastreadores no ejecutan JavaScript ni leen el "#" de la dirección, así que
// cada elemento se comparte con un enlace propio (/a/categoria/id) que devuelve las
// etiquetas Open Graph con su imagen y nombre. Las personas que abren el enlace
// pasan directo a la app (/#categoria/id).

const DB = 'https://tvsfclaunion-78912-default-rtdb.firebaseio.com';

const LABELS = {
  inicio: 'Inicio', facebooklive: 'Facebook Live', contacto: 'Contacto', eventos: 'FB Live',
  canales: 'Canales Nacionales', canalesInt: 'Canales Internacionales',
  canalesDeportes: 'Canales De Deportes Nacional', canalesDeportesInt: 'Canales De Deportes Internacional',
  canalesReligiosoNac: 'Canales Religioso Nacional', canalesReligiosoInt: 'Canales Religioso Internacional',
  canalesMusic: 'Canales de Música 24/7', canalesInfantil: 'Canales Infantiles', canalesNavidad: 'Navidad 24/7',
  radio: 'Emisoras Nacionales', radioInt: 'Emisoras Internacionales', radioSFC: 'Emisoras SFC',
  radioCristianaSFC: 'Emisoras Cristianas SFC', radioCristianaNac: 'Emisoras Cristianas Nacionales', radioCristianaInt: 'Emisoras Cristianas Internacionales',
  radioCatolicaSFC: 'Emisoras Católicos SFC', radioCatolicaNac: 'Emisoras Católicos Nacionales', radioCatolicaInt: 'Emisoras Católicos Internacionales',
  videos: 'Entretenimiento 24/7', videosCinema: '24/7 CINEMA', noticias: 'Noticias 24/7',
  religiosos: 'Música Cristiano', videosReligioso: '24/7 Religioso', videosCatolicos: 'Música Católica 24/7',
  music247: 'Music 24/7', navidad: 'Música Navideña 24/7', peliculas247: 'Películas 24/7', deportes: 'Deportes',
  anuncios: 'Anuncios', anunciosCristianos: 'Anuncios Cristianos', anunciosCatolicos: 'Anuncios Católicos'
};
const ANUNCIOS = ['anuncios', 'anunciosCristianos', 'anunciosCatolicos'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const esHttp = (u) => /^https?:\/\//i.test(u || '');

// Imagen de vista previa (JPG) de una foto o video subido a Cloudinary
function cloudOg(url) {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/)(image|video)\/upload\/(?:(?!v\d+\/)[^/]+\/)?(v\d+\/.+?)(?:\.[A-Za-z0-9]+)?(?:\?.*)?$/.exec(url || '');
  if (!m) return null;
  return m[2] === 'video'
    ? m[1] + 'video/upload/so_0,w_1200,c_limit,f_jpg/' + m[3] + '.jpg'
    : m[1] + 'image/upload/w_1200,c_limit,q_auto,f_jpg/' + m[3] + '.jpg';
}

function ytThumb(url) {
  const m = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/i.exec(url || '');
  return m ? 'https://img.youtube.com/vi/' + m[1] + '/hqdefault.jpg' : null;
}

export default async function handler(req, res) {
  const { cat, id, n, i } = req.query;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = 'https://' + host;
  const idOk = !id || /^[\w.-]+$/.test(id);

  const esCustom = /^custom_\d+$/.test(cat || '');
  if ((!Object.prototype.hasOwnProperty.call(LABELS, cat) && !esCustom) || !idOk) {
    res.statusCode = 302;
    res.setHeader('Location', origin + '/');
    return res.end();
  }

  // Datos del elemento: primero Firebase; si no está (elementos fijos de la app), los del enlace
  let item = null;
  if (id) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(DB + '/contenido/' + cat + '/' + encodeURIComponent(id) + '.json', { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) item = await r.json();
    } catch (e) { /* sin datos: se usan los del enlace */ }
    if (!item && (n || i)) item = { nombre: String(n || '').slice(0, 90), logo: esHttp(i) ? i : '' };
  }

  // Secciones agregadas por el administrador: su nombre y tipo vienen de Firebase
  let cfgCustom = null;
  if (esCustom) {
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 4000);
      const r2 = await fetch(DB + '/contenido/seccionesPersonalizadas/' + cat + '.json', { signal: ctrl2.signal });
      clearTimeout(t2);
      if (r2.ok) cfgCustom = await r2.json();
    } catch (e) { /* sin datos */ }
  }
  const label = esCustom ? ((cfgCustom && (cfgCustom.titulo || cfgCustom.menu)) || 'TV SFC LA UNION') : LABELS[cat];
  const esAnuncio = esCustom ? !!(cfgCustom && cfgCustom.tipo === 'anuncios') : ANUNCIOS.includes(cat);
  const esRadio = esCustom ? !!(cfgCustom && cfgCustom.tipo === 'radio') : cat.indexOf('radio') === 0;
  const titulo = item && item.nombre ? item.nombre : (esAnuncio && id ? 'Anuncio' : label);
  let imagen = origin + '/icons/icon-512.png';
  if (item) {
    const yt = esAnuncio ? ytThumb(item.url) : null;
    const co = esAnuncio ? cloudOg(item.url) : null;
    if (co) imagen = co;
    else if (yt) imagen = yt;
    else if (esAnuncio && esHttp(item.url)) imagen = item.url;       // el anuncio es la imagen
    else if (esHttp(item.logo)) imagen = item.logo;                  // canales y emisoras: su logo
  }

  let desc;
  if (!id) desc = 'Mira ' + label + ' en TV SFC LA UNION';
  else if (esAnuncio) desc = (item && item.descripcion) ? String(item.descripcion).slice(0, 200) : '📢 Mira este anuncio en TV SFC LA UNION';
  else desc = (esRadio ? '📻 Escucha ' : '📺 Mira ') + titulo + ' en TV SFC LA UNION';

  const enlace = origin + '/a/' + cat + (id ? '/' + encodeURIComponent(id) : '');
  const seccion = cat === 'eventos' ? 'facebooklive' : cat;   // las transmisiones de Facebook Live se ven en esa sección
  const destino = origin + '/#' + seccion + (id ? '/' + encodeURIComponent(id) : '');

  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(titulo) + ' - TV SFC LA UNION</title>' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="TV SFC LA UNION">' +
    '<meta property="og:title" content="' + esc(titulo) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(imagen) + '">' +
    '<meta property="og:image:alt" content="' + esc(titulo) + '">' +
    '<meta property="og:url" content="' + esc(enlace) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(titulo) + '">' +
    '<meta name="twitter:image" content="' + esc(imagen) + '">' +
    '<script>location.replace(' + JSON.stringify(destino).replace(/</g, '\\u003c') + ');</script>' +
    '</head><body style="font-family:sans-serif;text-align:center;padding:30px;background:#020617;color:#fff">' +
    '<p>Abriendo…</p><p><a style="color:#38bdf8" href="' + esc(destino) + '">Abrir en TV SFC LA UNION</a></p>' +
    '</body></html>';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.end(html);
}
