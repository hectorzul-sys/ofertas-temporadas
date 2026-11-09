// Catálogo del cuestionario (/quiero sin nada más): categorías, sus preguntas con opciones recomendadas y rangos de precio.
// Cada opción trae las palabras que de verdad salen en los títulos de Promodescuentos.
// Cómo se combinan: dentro de una pregunta basta UNA de las marcadas (LG o TCL); entre preguntas, TODAS (marca y 4K y tamaño).
// "base": palabras que siempre deben salir (que sea una tele y no otra cosa). "piso": precio mínimo si no eligen otro,
// para que no lleguen accesorios baratos. "excluir": se suma a los accesorios de siempre.
// Hector no edita esto a mano: le dice a Claude qué añadir ("pon Hisense en audífonos").

const TV = ['pantalla', 'tv', 'smart tv', 'television', 'televisor'];

export const CATEGORIAS = [
  {
    id: 'tv', boton: '📺 Tele', nombre: 'Tele', base: TV, piso: 2000,
    preguntas: [
      { texto: '¿Qué marca?', tip: 'Samsung, LG y Sony: las de más calidad. TCL y Hisense: mucha tele por el precio.', opciones: [
        ['Samsung', ['samsung']], ['LG', ['lg']], ['Sony', ['sony', 'bravia']], ['TCL', ['tcl']], ['Hisense', ['hisense']], ['Xiaomi', ['xiaomi']]] },
      { texto: '¿Qué tipo de pantalla?', tip: '4K es lo básico hoy. QLED y Mini LED brillan más (salas con luz). OLED: el mejor negro, la más cara.', opciones: [
        ['4K', ['4k', 'uhd']], ['QLED', ['qled']], ['Mini LED', ['mini led', 'miniled', 'qned']], ['OLED', ['oled']]] },
      { texto: '¿De qué tamaño?', tip: 'Para una sala normal (2 a 3 m del sillón), 55" o 65".', opciones: [
        ['43"', ['43']], ['50"', ['50']], ['55"', ['55']], ['65"', ['65']], ['75" o más', ['75', '77', '83', '85', '98', '100']]] },
    ],
    precios: [[null, 5000], [5000, 9000], [9000, 15000], [15000, 25000]],
  },
  {
    id: 'consola', boton: '🎮 Consola', nombre: 'Consola', piso: 3500,
    excluir: ['videojuego', 'juego para', 'juego de', 'dualsense', 'control', 'membresia', 'suscripcion', 'game pass', 'tarjeta de regalo'],
    preguntas: [
      { texto: '¿Cuál consola?', tip: 'Puedes marcar varias y te aviso de la que salga primero.', obligatoria: true, opciones: [
        ['PS5', ['ps5', 'playstation 5']], ['PS5 Pro', ['ps5 pro', 'playstation 5 pro']], ['Xbox Series X', ['xbox series x', 'series x']],
        ['Xbox Series S', ['xbox series s', 'series s']], ['Switch 2', ['switch 2', 'nintendo switch 2']], ['Switch OLED', ['switch oled']]] },
    ],
    precios: [[null, 6000], [6000, 10000], [10000, 14000]],
  },
  {
    id: 'control', boton: '🕹️ Control', nombre: 'Control', base: ['control', 'mando', 'gamepad', 'controller'], piso: 300,
    excluir: ['control remoto', 'control de voz', 'control por voz', 'base de carga', 'videojuego', ...TV],
    preguntas: [
      { texto: '¿Para qué consola?', obligatoria: true, opciones: [
        ['Xbox', ['xbox']], ['PlayStation', ['dualsense', 'ps5', 'playstation', 'dualshock']], ['Switch', ['switch', 'joy con', 'pro controller']],
        ['PC', ['pc']]] },
    ],
    precios: [[null, 800], [800, 1500], [1500, 3000]],
  },
  {
    id: 'audifonos', boton: '🎧 Audífonos', nombre: 'Audífonos', base: ['audifonos', 'audifono', 'airpods', 'earbuds', 'headset', 'buds'], piso: 200,
    preguntas: [
      { texto: '¿De qué tipo?', tip: 'Los de "cancelación de ruido" tapan el ruido de la calle; los gamer traen micrófono.', opciones: [
        ['Inalámbricos chicos', ['earbuds', 'buds', 'airpods', 'true wireless', 'tws']], ['De diadema', ['diadema', 'over ear', 'over-ear']],
        ['Cancelación de ruido', ['cancelacion de ruido', 'anc', 'noise cancelling']], ['Gamer', ['gamer', 'gaming', 'headset']]] },
      { texto: '¿Qué marca?', opciones: [
        ['Sony', ['sony']], ['Apple', ['airpods', 'apple', 'beats']], ['Samsung', ['samsung', 'galaxy buds']], ['JBL', ['jbl']],
        ['Bose', ['bose']], ['Soundcore', ['soundcore', 'anker']]] },
    ],
    precios: [[null, 1000], [1000, 3000], [3000, 6000]],
  },
  {
    id: 'audio', boton: '🔊 Audio de casa', nombre: 'Audio', piso: 400,
    preguntas: [
      { texto: '¿Qué buscas?', obligatoria: true, tip: 'Para la tele: barra de sonido. Para fiestas: minicomponente o bocina grande.', opciones: [
        ['Barra / home theater', ['barra de sonido', 'soundbar', 'home theater', 'home theatre', 'teatro en casa']],
        ['Minicomponente', ['minicomponente', 'mini componente', 'microcomponente', 'micro componente', 'equipo de sonido']],
        ['Bocina bluetooth', ['bocina', 'altavoz', 'parlante', 'speaker']],
        ['Tornamesa', ['tornamesa', 'tocadiscos', 'turntable', 'reproductor de vinil', 'reproductor de vinilo']]] },
      { texto: '¿Qué marca?', opciones: [
        ['Sony', ['sony']], ['LG', ['lg', 'xboom']], ['Samsung', ['samsung']], ['JBL', ['jbl']], ['Bose', ['bose']],
        ['Yamaha', ['yamaha']], ['Audio-Technica', ['audio technica', 'audio-technica']]] },
    ],
    precios: [[null, 2000], [2000, 5000], [5000, 10000]],
  },
  {
    id: 'celular', boton: '📱 Celular', nombre: 'Celular', piso: 1500,
    base: ['celular', 'smartphone', 'telefono', 'iphone', 'galaxy', 'redmi', 'poco', 'moto g', 'moto edge', 'pixel'],
    excluir: ['mica', 'funda', 'cargador', 'cable', 'protector', 'bocina', 'audifonos', 'buds', 'watch', 'reloj', 'tablet', 'tab', 'ipad'],
    preguntas: [
      { texto: '¿Qué marca?', obligatoria: true, opciones: [
        ['iPhone', ['iphone']], ['Samsung Galaxy', ['galaxy']], ['Xiaomi / Redmi', ['xiaomi', 'redmi', 'poco']],
        ['Motorola', ['motorola', 'moto g', 'moto edge']], ['Google Pixel', ['pixel']]] },
    ],
    precios: [[null, 5000], [5000, 10000], [10000, 20000], [20000, null]],
  },
  {
    id: 'laptop', boton: '💻 Laptop', nombre: 'Laptop', base: ['laptop', 'notebook', 'macbook', 'computadora portatil', 'chromebook'], piso: 4000,
    preguntas: [
      { texto: '¿Para qué la quieres?', tip: 'Para escuela y oficina basta una normal; "gamer" trae tarjeta de video.', opciones: [
        ['Escuela / oficina', []], ['Gamer', ['gamer', 'gaming', 'rtx']], ['MacBook', ['macbook']]], unaSola: true },
      { texto: '¿Qué marca?', opciones: [
        ['Lenovo', ['lenovo', 'ideapad', 'thinkpad', 'legion']], ['HP', ['hp', 'victus', 'omen']], ['Dell', ['dell']],
        ['Asus', ['asus', 'vivobook', 'rog', 'tuf']], ['Acer', ['acer', 'aspire', 'nitro']], ['Apple', ['macbook', 'apple']]] },
    ],
    precios: [[null, 10000], [10000, 20000], [20000, 30000]],
  },
  {
    id: 'herramienta', boton: '🔧 Herramienta', nombre: 'Herramienta', piso: 300,
    excluir: ['broca', 'brocas', 'kit de accesorios', 'accesorios para', 'bateria para', 'disco para'],
    preguntas: [
      { texto: '¿Qué herramienta?', obligatoria: true, opciones: [
        ['Taladro / rotomartillo', ['taladro', 'rotomartillo']], ['Atornillador / llave de impacto', ['atornillador', 'llave de impacto', 'impacto']],
        ['Esmeril / pulidora', ['esmeril', 'pulidora', 'amoladora']], ['Sierra', ['sierra', 'caladora']],
        ['Hidrolavadora', ['hidrolavadora']], ['Compresor', ['compresor']], ['Caja / juego de herramientas', ['caja de herramientas', 'juego de herramientas', 'juego de llaves']]] },
      { texto: '¿Qué marca?', tip: 'DeWalt, Makita y Milwaukee: uso rudo. Bosch: muy buena. Truper y Black+Decker: para la casa.', opciones: [
        ['DeWalt', ['dewalt']], ['Makita', ['makita']], ['Milwaukee', ['milwaukee']], ['Bosch', ['bosch']],
        ['Truper', ['truper', 'pretul']], ['Black+Decker', ['black decker', 'black+decker', 'black and decker']]] },
      { texto: '¿Con batería?', unaSola: true, opciones: [['Sí, inalámbrica', ['inalambrico', 'inalambrica', 'bateria', '20v', '18v', '12v']]] },
    ],
    precios: [[null, 1500], [1500, 3000], [3000, 6000]],
  },
  {
    id: 'electro', boton: '🏠 Electrodoméstico', nombre: 'Electrodoméstico', piso: 500,
    excluir: ['filtro', 'repuesto', 'refaccion'],
    preguntas: [
      { texto: '¿Qué aparato?', obligatoria: true, opciones: [
        ['Refrigerador', ['refrigerador', 'refri', 'refrigeradora']], ['Lavadora', ['lavadora']], ['Secadora', ['secadora']],
        ['Freidora de aire', ['freidora']], ['Microondas', ['microondas']], ['Aspiradora / robot', ['aspiradora']],
        ['Cafetera', ['cafetera']], ['Minisplit / aire', ['minisplit', 'mini split', 'aire acondicionado']], ['Estufa', ['estufa']]] },
      { texto: '¿Qué marca?', opciones: [
        ['LG', ['lg']], ['Samsung', ['samsung']], ['Whirlpool', ['whirlpool']], ['Mabe', ['mabe']], ['Ninja', ['ninja']],
        ['Philips', ['philips']], ['Oster', ['oster']], ['Midea', ['midea']]] },
    ],
    precios: [[null, 3000], [3000, 8000], [8000, 15000], [15000, null]],
  },
];

export const categoria = (id) => CATEGORIAS.find((c) => c.id === id);
