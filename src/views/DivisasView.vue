<template>
  <div class="calculadora-divisas">
    <h1>Calculadora de Divisas</h1>

    <div class="contenedor-principal">
      <div class="bloque-moneda">
        <label>Cantidad:</label>
        <input v-model.number="cantidad" type="number" placeholder="Ingrese cantidad" @input="handleInput" min="0" />

        <label>Moneda origen:</label>
        <div class="custom-select" :class="{ 'abierto': dropdownAbiertoOrigen }">
          <div class="select-trigger" @click.stop="toggleDropdownOrigen">
            <span class="codigo-moneda">{{ monedaOrigen }}</span>
            <span class="nombre-moneda-trigger" v-if="getNombreMoneda(monedaOrigen)">({{ getNombreMoneda(monedaOrigen)
            }})</span>
            <span class="flecha">▼</span>
          </div>
          <div v-if="dropdownAbiertoOrigen" class="select-dropdown">
            <input ref="inputBusquedaOrigen" v-model="busquedaOrigen" type="text" class="buscador-moneda"
              placeholder="Buscar moneda..." @click.stop />
            <div class="opciones-lista">
              <div v-for="moneda in filtrarMonedas(busquedaOrigen)" :key="moneda" class="opcion"
                :class="{ 'seleccionada': monedaOrigen === moneda }" @click="seleccionarMonedaOrigen(moneda)">
                {{ moneda }} <span class="nombre-moneda" v-if="getNombreMoneda(moneda)">({{ getNombreMoneda(moneda)
                }})</span>
              </div>
            </div>
          </div>
        </div>

        <label>Fecha de tasas:</label>
        <input type="date" v-model="fechaSeleccionada" :max="hoy" @change="cargarTasas" class="input-fecha" />
      </div>

      <div class="contenedor-invertir">
        <button class="boton-invertir" @click="invertirDivisas" title="Invertir divisas">⇄</button>
      </div>

      <div class="bloque-moneda">
        <label>Resultado:</label>
        <div class="resultado">
          {{ Number.isFinite(resultado) ? resultado.toFixed(2) : '0.00' }}
        </div>

        <label>Moneda destino:</label>
        <div class="custom-select" :class="{ 'abierto': dropdownAbiertoDestino }">
          <div class="select-trigger" @click.stop="toggleDropdownDestino">
            <span class="codigo-moneda">{{ monedaDestino }}</span>
            <span class="nombre-moneda-trigger" v-if="getNombreMoneda(monedaDestino)">({{ getNombreMoneda(monedaDestino)
            }})</span>
            <span class="flecha">▼</span>
          </div>
          <div v-if="dropdownAbiertoDestino" class="select-dropdown">
            <input ref="inputBusquedaDestino" v-model="busquedaDestino" type="text" class="buscador-moneda"
              placeholder="Buscar moneda..." @click.stop />
            <div class="opciones-lista">
              <div v-for="moneda in filtrarMonedas(busquedaDestino)" :key="moneda" class="opcion"
                :class="{ 'seleccionada': monedaDestino === moneda }" @click="seleccionarMonedaDestino(moneda)">
                {{ moneda }} <span class="nombre-moneda" v-if="getNombreMoneda(moneda)">({{ getNombreMoneda(moneda)
                }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>


    <div v-if="resultado !== null" class="info-conversion">
      <p><b>{{ cantidad }} {{ monedaOrigen }}</b> = <b>{{ resultado.toFixed(2) }} {{ monedaDestino
      }}</b></p>
      <p class="tasa">Tasa de cambio: 1 {{ monedaOrigen }} = {{ tasaCambio.toFixed(10) }} {{ monedaDestino }} <span
          v-if="fechaSeleccionada">(fecha: {{ fechaFormateada }})</span><span v-else>(últimos datos)</span></p>
      <div class="apis-info">
        <p>APIs consultadas: <b>{{ numApisConsultados }}</b></p>
      </div>
    </div>


    <div v-if="cargando" class="mensaje cargando">Cargando datos de monedas...</div>
    <div v-if="error" class="mensaje error">{{ error }}</div>
  </div>


</template>

<script setup>
import { ref, onMounted, computed, onBeforeUnmount, nextTick } from 'vue'

// refs
const cantidad = ref(null)
const monedaOrigen = ref('EUR')
const monedaDestino = ref('USD')
const resultado = ref(null)
const tasaCambio = ref(1)
const numApisConsultados = ref(0)
const monedasDisponibles = ref([])
const tasasConversion = ref({})
const numApis = ref({})
const cargando = ref(true)
const componenteListo = ref(false)
const error = ref('')
const busquedaOrigen = ref('')
const busquedaDestino = ref('')
const dropdownAbiertoOrigen = ref(false)
const dropdownAbiertoDestino = ref(false)
const inputBusquedaOrigen = ref(null)
const inputBusquedaDestino = ref(null)
const hoy = new Date().toLocaleDateString('sv-SE')
const fechaSeleccionada = ref(hoy)
const fechaRealDatos = ref(null)
let debounceTimer = null

// computed para mostrar fecha en formato dd-mm-yyyy
const fechaFormateada = computed(() => {
  // Priorizamos la fecha real de los datos devuelta por InfluxDB
  const fechaAMostrar = fechaRealDatos.value || fechaSeleccionada.value;
  if (!fechaAMostrar) return null;
  const [y, m, d] = fechaAMostrar.split('-');
  return `${d}-${m}-${y}`;
})

// mapa de monedas
const nombresMonedas = {
  'AED': 'Dirham de los Emiratos Árabes Unidos',
  'AFN': 'Afgani afgano',
  'ALL': 'Lek albanés',
  'AMD': 'Dram armenio',
  'ANG': 'Florín antillano neerlandés',
  'AOA': 'Kwanza angoleño',
  'ARS': 'Peso argentino',
  'AUD': 'Dólar australiano',
  'AWG': 'Florín arubeño',
  'AZN': 'Manat azerbaiyano',
  'BAM': 'Marco convertible',
  'BBD': 'Dólar de Barbados',
  'BDT': 'Taka bangladesí',
  'BGN': 'Lev búlgaro',
  'BHD': 'Dinar bahreiní',
  'BIF': 'Franco burundés',
  'BMD': 'Dólar bermudeño',
  'BND': 'Dólar de Brunéi',
  'BOB': 'Boliviano',
  'BRL': 'Real brasileño',
  'BSD': 'Dólar bahameño',
  'BTN': 'Ngultrum butanés',
  'BWP': 'Pula botsuano',
  'BYN': 'Rublo bielorruso',
  'BZD': 'Dólar beliceño',
  'CAD': 'Dólar canadiense',
  'CDF': 'Franco congoleño',
  'CHF': 'Franco suizo',
  'CLP': 'Peso chileno',
  'CNY': 'Yuan chino',
  'COP': 'Peso colombiano',
  'CRC': 'Colón costarricense',
  'CUP': 'Peso cubano',
  'CVE': 'Escudo caboverdiano',
  'CZK': 'Corona checa',
  'DJF': 'Franco yibutiano',
  'DKK': 'Corona danesa',
  'DOP': 'Peso dominicano',
  'DZD': 'Dinar argelino',
  'EGP': 'Libra egipcia',
  'ERN': 'Nakfa eritreo',
  'ETB': 'Birr etíope',
  'EUR': 'Euro',
  'FJD': 'Dólar fiyiano',
  'FKP': 'Libra malvinense',
  'FOK': 'Corona feroesa',
  'GBP': 'Libra esterlina',
  'GEL': 'Lari georgiano',
  'GGP': 'Libra de Guernesey',
  'GHS': 'Cedi ghanés',
  'GIP': 'Libra de Gibraltar',
  'GMD': 'Dalasi gambiano',
  'GNF': 'Franco guineano',
  'GTQ': 'Quetzal guatemalteco',
  'GYD': 'Dólar guyanés',
  'HKD': 'Dólar de Hong Kong',
  'HNL': 'Lempira hondureño',
  'HRK': 'Kuna croata',
  'HTG': 'Gourde haitiano',
  'HUF': 'Forinto húngaro',
  'IDR': 'Rupia indonesia',
  'ILS': 'Nuevo séquel israelí',
  'IMP': 'Libra manesa',
  'INR': 'Rupia india',
  'IQD': 'Dinar iraquí',
  'IRR': 'Rial iraní',
  'ISK': 'Corona islandesa',
  'JEP': 'Libra de Jersey',
  'JMD': 'Dólar jamaicano',
  'JOD': 'Dinar jordano',
  'JPY': 'Yen japonés',
  'KES': 'Chelín keniano',
  'KGS': 'Som kirguís',
  'KHR': 'Riel camboyano',
  'KID': 'Dólar de Kiribati',
  'KMF': 'Franco comorense',
  'KRW': 'Won surcoreano',
  'KWD': 'Dinar kuwaití',
  'KYD': 'Dólar de las Islas Caimán',
  'KZT': 'Tenge kazajo',
  'LAK': 'Kip lao',
  'LBP': 'Libra libanesa',
  'LKR': 'Rupia de Sri Lanka',
  'LRD': 'Dólar liberiano',
  'LSL': 'Loti lesothense',
  'LYD': 'Dinar libio',
  'MAD': 'Dírham marroquí',
  'MDL': 'Leu moldavo',
  'MGA': 'Ariary malgache',
  'MKD': 'Denar macedonio',
  'MMK': 'Kyat birmano',
  'MNT': 'Tugrik mongol',
  'MOP': 'Pataca de Macao',
  'MRU': 'Ouguiya mauritana',
  'MUR': 'Rupia mauriciana',
  'MVR': 'Rufiyaa maldiva',
  'MWK': 'Kwacha malauí',
  'MXN': 'Peso mexicano',
  'MYR': 'Ringgit malayo',
  'MZN': 'Metical mozambiqueño',
  'NAD': 'Dólar namibio',
  'NGN': 'Naira nigeriana',
  'NIO': 'Córdoba nicaragüense',
  'NOK': 'Corona noruega',
  'NPR': 'Rupia nepalí',
  'NZD': 'Dólar neozelandés',
  'OMR': 'Rial omaní',
  'PAB': 'Balboa panameño',
  'PEN': 'Sol peruano',
  'PGK': 'Kina de Papúa Nueva Guinea',
  'PHP': 'Peso filipino',
  'PKR': 'Rupia pakistaní',
  'PLN': 'Zloty polaco',
  'PYG': 'Guaraní paraguayo',
  'QAR': 'Riyal qatarí',
  'RON': 'Leu rumano',
  'RSD': 'Dinar serbio',
  'RUB': 'Rublo ruso',
  'RWF': 'Franco ruandés',
  'SAR': 'Riyal saudí',
  'SBD': 'Dólar de las Islas Salomón',
  'SCR': 'Rupia seychellense',
  'SDG': 'Libra sudanesa',
  'SEK': 'Corona sueca',
  'SGD': 'Dólar de Singapur',
  'SHP': 'Libra de Santa Elena',
  'SLL': 'Leone de Sierra Leona',
  'SOS': 'Chelín somalí',
  'SRD': 'Dólar surinamés',
  'SSP': 'Libra sursudanesa',
  'STN': 'Dobra de Santo Tomé y Príncipe',
  'SYP': 'Libra siria',
  'SZL': 'Lilangeni suazi',
  'THB': 'Baht tailandés',
  'TJS': 'Somoni tayiko',
  'TMT': 'Manat turcomano',
  'TND': 'Dinar tunecino',
  'TOP': 'Paʻanga tongano',
  'TRY': 'Lira turca',
  'TTD': 'Dólar de Trinidad y Tobago',
  'TVD': 'Dólar tuvaluano',
  'TWD': 'Nuevo dólar taiwanés',
  'TZS': 'Chelín tanzano',
  'UAH': 'Grivna ucraniana',
  'UGX': 'Chelín ugandés',
  'USD': 'Dólar estadounidense',
  'UYU': 'Peso uruguayo',
  'UZS': 'Som uzbeko',
  'VES': 'Bolívar soberano',
  'VND': 'Dong vietnamita',
  'VUV': 'Vatu vanuatuense',
  'WST': 'Tala samoano',
  'XAF': 'Franco CFA de África Central',
  'XCD': 'Dólar del Caribe Oriental',
  'XDR': 'Derechos especiales de giro',
  'XOF': 'Franco CFA de África Occidental',
  'XPF': 'Franco CFP',
  'YER': 'Rial yemení',
  'ZAR': 'Rand sudafricano',
  'ZMW': 'Kwacha zambiano',
  'ZWL': 'Dólar zimbabuense',
  'ADA': 'Cardano',
  'ARB': 'Arbitrum',
  'BNB': 'Binance Coin',
  'BTC': 'Bitcoin',
  'BYR': 'Rublo bielorruso (antiguo)',
  'CLF': 'Unidad de Fomento chilena',
  'CNH': 'Yuan chino (extranjero)',
  'CUC': 'Peso cubano convertible',
  'DAI': 'Dai',
  'DOT': 'Polkadot',
  'ETH': 'Ethereum',
  'KPW': 'Won norcoreano',
  'LTC': 'Litecoin',
  'LTL': 'Litas lituana',
  'LVL': 'Lats letón',
  'MRO': 'Ouguiya mauritana (antigua)',
  'SLE': 'Leona de Sierra Leona (nuevo)',
  'SOL': 'Solana',
  'STD': 'Dobra de Santo Tomé y Príncipe (antigua)',
  'SVC': 'Colón salvadoreño',
  'TRX': 'TRON',
  'VEF': 'Bolívar fuerte venezolano',
  'XAG': 'Plata (onza troy)',
  'XAU': 'Oro (onza troy)',
  'XCG': 'Florín del Caribe',
  'XPD': 'Paladio (onza troy)',
  'XPT': 'Platino (onza troy)',
  'XRP': 'Ripple',
  'ZMK': 'Kwacha zambiano (antiguo)',
  'ZWG': 'Oro de Zimbabue',
  '1INCH': '1inch',
  'AAVE': 'Aave',
  'AGIX': 'SingularityNET',
  'AKT': 'Akash Network',
  'ALGO': 'Algorand',
  'AMP': 'Amp',
  'APE': 'ApeCoin',
  'APT': 'Aptos',
  'AR': 'Arweave',
  'ATOM': 'Cosmos',
  'ATS': 'Chelín austriaco',
  'AVAX': 'Avalanche',
  'AXS': 'Axie Infinity',
  'AZM': 'Manat azerbaiyano (antiguo)',
  'BAKE': 'BakeryToken',
  'BAT': 'Basic Attention Token',
  'BCH': 'Bitcoin Cash',
  'BEF': 'Franco belga',
  'BSV': 'Bitcoin SV',
  'BSW': 'Biswap',
  'BTCB': 'Bitcoin BEP2',
  'BTG': 'Bitcoin Gold',
  'BTT': 'BitTorrent',
  'BUSD': 'Binance USD',
  'CAKE': 'PancakeSwap',
  'CELO': 'Celo',
  'CFX': 'Conflux',
  'CHZ': 'Chiliz',
  'COMP': 'Compound',
  'CRO': 'Cronos',
  'CRV': 'Curve DAO Token',
  'CSPR': 'Casper',
  'CVX': 'Convex Finance',
  'CYP': 'Libra chipriota',
  'DASH': 'Dash',
  'DCR': 'Decred',
  'DEM': 'Marco alemán',
  'DFI': 'DeFiChain',
  'DOGE': 'Dogecoin',
  'DYDX': 'dYdX',
  'EEK': 'Corona estonia',
  'EGLD': 'MultiversX',
  'ENJ': 'Enjin Coin',
  'EOS': 'EOS',
  'ESP': 'Peseta española',
  'ETC': 'Ethereum Classic',
  'EURC': 'EURC',
  'FEI': 'Fei USD',
  'FIL': 'Filecoin',
  'FIM': 'Marco finlandés',
  'FLOW': 'Flow',
  'FLR': 'Flare',
  'FRAX': 'Frax',
  'FRF': 'Franco francés',
  'FTT': 'FTX Token',
  'GALA': 'Gala',
  'GHC': 'Cedi ghanés (antiguo)',
  'GMX': 'GMX',
  'GNO': 'Gnosis',
  'GRD': 'Dracma griego',
  'GRT': 'The Graph',
  'GT': 'GateToken',
  'GUSD': 'Gemini Dollar',
  'HBAR': 'Hedera',
  'HNT': 'Helium',
  'HOT': 'Holo',
  'HT': 'Huobi Token',
  'ICP': 'Internet Computer',
  'IEP': 'Libra irlandesa',
  'IMX': 'Immutable',
  'INJ': 'Injective',
  'ITL': 'Lira italiana',
  'KAS': 'Kaspa',
  'KAVA': 'Kava',
  'KCS': 'KuCoin Token',
  'KDA': 'Kadena',
  'KLAY': 'Klaytn',
  'KNC': 'Kyber Network Crystal',
  'KSM': 'Kusama',
  'LDO': 'Lido DAO',
  'LEO': 'UNUS SED LEO',
  'LINK': 'Chainlink',
  'LRC': 'Loopring',
  'LUF': 'Franco luxemburgués',
  'LUNA': 'Terra',
  'LUNC': 'Terra Classic',
  'MANA': 'Decentraland',
  'MBX': 'MARBLEX',
  'MGF': 'Franco malgache',
  'MINA': 'Mina',
  'MKR': 'Maker',
  'MTL': 'Metal',
  'MXV': 'Unidad de Inversión mexicana',
  'MZM': 'Metical mozambiqueño (antiguo)',
  'NEAR': 'Near Protocol',
  'NEO': 'NEO',
  'NEXO': 'Nexo',
  'NFT': 'APENFT',
  'NLG': 'Florín neerlandés',
  'OKB': 'OKB',
  'ONE': 'Harmony',
  'OP': 'Optimism',
  'ORDI': 'Ordinals',
  'PAXG': 'PAX Gold',
  'PEPE': 'Pepe',
  'PI': 'Pi Network',
  'POL': 'Polygon Ecosystem Token',
  'PTE': 'Escudo portugués',
  'QNT': 'Quant',
  'QTUM': 'Qtum',
  'ROL': 'Leu rumano (antiguo)',
  'RPL': 'Rocket Pool',
  'RUNE': 'THORChain',
  'RVN': 'Ravencoin',
  'SAND': 'The Sandbox',
  'SDD': 'Dinar sudanés (antiguo)',
  'SHIB': 'Shiba Inu',
  'SIT': 'Tólar esloveno',
  'SKK': 'Corona eslovaca',
  'SNX': 'Synthetix',
  'SPL': 'Luigino de Seborga',
  'SRG': 'Florín de Surinam (antiguo)',
  'STX': 'Stacks',
  'SUI': 'Sui',
  'THETA': 'Theta Network',
  'TMM': 'Manat turcomano (antiguo)',
  'TON': 'Toncoin',
  'TRL': 'Lira turca (antigua)',
  'TUSD': 'TrueUSD',
  'TWT': 'Trust Wallet Token',
  'UNI': 'Uniswap',
  'USDC': 'USD Coin',
  'USDD': 'USDD',
  'USDP': 'Pax Dollar',
  'USDT': 'Tether',
  'VAL': 'Sora Validator Token',
  'VEB': 'Bolívar venezolano (antiguo)',
  'VED': 'Bolívar digital',
  'VET': 'VeChain',
  'WAVES': 'Waves',
  'WEMIX': 'WEMIX',
  'WOO': 'WOO Network',
  'XAUT': 'Tether Gold',
  'XBT': 'Bitcoin',
  'XCH': 'Chia',
  'XDC': 'XDC Network',
  'XEC': 'eCash',
  'XEM': 'NEM',
  'XLM': 'Stellar',
  'XMR': 'Monero',
  'XTZ': 'Tezos',
  'ZEC': 'Zcash',
  'ZIL': 'Zilliqa',
  'ZWD': 'Dólar zimbabuense (antiguo)',
}

const getNombreMoneda = (codigo) => {
  return nombresMonedas[codigo] || ''
}

const toggleDropdownOrigen = async () => {
  dropdownAbiertoOrigen.value = !dropdownAbiertoOrigen.value
  if (dropdownAbiertoOrigen.value) {
    dropdownAbiertoDestino.value = false
    busquedaOrigen.value = ''
    await nextTick()
    inputBusquedaOrigen.value?.focus()
  }
}

const toggleDropdownDestino = async () => {
  dropdownAbiertoDestino.value = !dropdownAbiertoDestino.value
  if (dropdownAbiertoDestino.value) {
    dropdownAbiertoOrigen.value = false
    busquedaDestino.value = ''
    await nextTick()
    inputBusquedaDestino.value?.focus()
  }
}

const seleccionarMonedaOrigen = (moneda) => {
  monedaOrigen.value = moneda
  dropdownAbiertoOrigen.value = false
  convertir()
}

const seleccionarMonedaDestino = (moneda) => {
  monedaDestino.value = moneda
  dropdownAbiertoDestino.value = false
  convertir()
}

const invertirDivisas = () => {
  const temp = monedaOrigen.value
  monedaOrigen.value = monedaDestino.value
  monedaDestino.value = temp
  convertir()
}

const filtrarMonedas = (busqueda) => {
  const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const query = normalize(busqueda)

  return monedasDisponibles.value
    .filter(m => {
      const codigo = normalize(m)
      const nombre = normalize(getNombreMoneda(m))
      return codigo.includes(query) || nombre.includes(query)
    })
    .sort((a, b) => a.localeCompare(b))
}

const formatearFechaEncontrada = (fecha) => {
  if (!fecha) return null
  if (typeof fecha === 'string') {
    return fecha.split('T')[0]
  }
  if (fecha instanceof Date) {
    return fecha.toISOString().split('T')[0]
  }
  return String(fecha).split('T')[0]
}

const cargarTasas = async () => {
  try {
    const url = fechaSeleccionada.value
      ? `http://${window.location.hostname}:3000/api/tasas-cambio?fecha=${fechaSeleccionada.value}`
      : `http://${window.location.hostname}:3000/api/tasas-cambio`

    const respTasas = await fetch(url)
    const dataTasas = await respTasas.json()

    if (dataTasas.error) throw new Error(dataTasas.error)

    tasasConversion.value = dataTasas.tasas
    numApis.value = dataTasas.numApis

    // Guardamos la fecha real de los datos devuelta por el backend.
    // Si no hay datos para el día solicitado, la API devuelve los últimos datos disponibles.
    const fechaEncontradaFormateada = formatearFechaEncontrada(dataTasas.fechaEncontrada)
    if (fechaEncontradaFormateada) {
      fechaRealDatos.value = fechaEncontradaFormateada
    } else {
      fechaRealDatos.value = null
    }
    if (Object.keys(tasasConversion.value).length === 0) {
      error.value = `No hay datos disponibles.`
      return
    }

    convertir()
  } catch (err) {
    error.value = 'Error al cargar tasas: ' + err.message
  }
}

onMounted(async () => {
  document.title = "Divisas";
  window.addEventListener('click', cerrarDropdowns)
  try {
    const respMonedasList = await fetch(`http://${window.location.hostname}:3000/api/divisas`)
    const dataMonedas = await respMonedasList.json()

    if (dataMonedas.error) {
      throw new Error(dataMonedas.error)
    }

    if (!Array.isArray(dataMonedas.monedas)) {
      throw new Error('Formato de respuesta de monedas inválido')
    }

    monedasDisponibles.value = dataMonedas.monedas

    await cargarTasas()

    if (monedasDisponibles.value.includes('EUR')) {
      monedaOrigen.value = 'EUR'
    } else if (monedasDisponibles.value.length > 0) {
      monedaOrigen.value = monedasDisponibles.value[0]
    }

    if (monedasDisponibles.value.includes('USD')) {
      monedaDestino.value = 'USD'
    } else if (monedasDisponibles.value.length > 1) {
      monedaDestino.value = monedasDisponibles.value[1]
    }

    cargando.value = false
    componenteListo.value = true
  } catch (err) {
    console.error('Error detallado en la carga:', err);
    error.value = 'Error al cargar las monedas: ' + err.message
    cargando.value = false
  }
})


const convertir = () => {
  if (cantidad.value === null || cantidad.value === '') {
    error.value = ''
    resultado.value = null
    tasaCambio.value = 1
    numApisConsultados.value = 0
    return
  }

  if (cantidad.value <= 0) {
    error.value = 'Ingrese una cantidad mayor a 0'
    resultado.value = null
    tasaCambio.value = 1
    numApisConsultados.value = 0
    return
  }
  error.value = ''

  const tasaOrigen = monedaOrigen.value === 'EUR'
    ? 1
    : tasasConversion.value[monedaOrigen.value]
  const tasaDestino = monedaDestino.value === 'EUR'
    ? 1
    : tasasConversion.value[monedaDestino.value]

  if (
    tasaOrigen == null ||
    tasaDestino == null ||
    isNaN(tasaOrigen) ||
    isNaN(tasaDestino)
  ) {
    resultado.value = null
    tasaCambio.value = 1
    numApisConsultados.value = 0
    error.value = 'Error: No se encontraron tasas de cambio para las monedas seleccionadas'
    return
  }

  const enEUR = cantidad.value / tasaOrigen
  resultado.value = enEUR * tasaDestino
  tasaCambio.value = tasaDestino / tasaOrigen
  numApisConsultados.value = numApis.value[monedaDestino.value] || 0
  error.value = ''
}

const handleInput = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    convertir()
  }, 1000)
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  window.removeEventListener('click', cerrarDropdowns)
})

const cerrarDropdowns = (e) => {
  if (!e.target.closest('.custom-select')) {
    dropdownAbiertoOrigen.value = false
    dropdownAbiertoDestino.value = false
  }
}
</script>

<style scoped>
.calculadora-divisas {
  width: 600px;
  margin: 0 auto;
  padding: 30px;
  background: white;
  border-radius: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  min-height: 550px;
  display: flex;
  flex-direction: column;
}

h1 {
  text-align: center;
  color: #1e293b;
  margin-bottom: 30px;
  font-weight: 800;
  letter-spacing: -0.025em;
}

.contenedor-principal {
  display: flex;
  gap: 20px;
  align-items: stretch;
  margin-bottom: 30px;
}

.bloque-moneda {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  background: #f8f9fa;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  width: 240px;
  min-height: 150px;
  /* Altura fija */
  box-sizing: border-box;
  /* Para que el padding no rompa el alto fijo */
}

.bloque-moneda label {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.9rem;
}

.bloque-moneda input,
.bloque-moneda select {
  padding: 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
}

.bloque-moneda input:focus,
.bloque-moneda select:focus {
  outline: none;
  border-color: #4CAF50;
  box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
}

.resultado {
  padding: 12px;
  background: #f0fdf4;
  border: 2px solid #22c55e;
  border-radius: 12px;
  font-size: 1.75rem;
  font-weight: 800;
  color: #15803d;
  text-align: center;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}



button {
  padding: 10px 30px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  height: 40px;
}

button:hover:not(:disabled) {
  background: #45a049;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.contenedor-invertir {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 40px;
}

.boton-invertir {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  color: #4CAF50;
  border: 2px solid #4CAF50;
}

.boton-invertir:hover {
  background: #4CAF50;
  color: white;
}

.custom-select {
  position: relative;
  width: 100%;
}

.select-trigger {
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-size: 1rem;
  gap: 5px;
}

.codigo-moneda {
  font-weight: 600;
}

.nombre-moneda-trigger {
  font-size: 0.85rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.custom-select.abierto .select-trigger {
  border-color: #4CAF50;
  box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
}

.flecha {
  font-size: 0.7rem;
  color: #888;
  margin-left: auto;
  transition: transform 0.3s ease;
}

.custom-select.abierto .flecha {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-top: 5px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.buscador-moneda {
  padding: 10px;
  border: none !important;
  border-bottom: 1px solid #eee !important;
  border-radius: 0 !important;
  width: 100%;
  box-sizing: border-box;
}

.buscador-moneda:focus {
  box-shadow: none !important;
  background: #fcfcfc;
}

.opciones-lista {
  max-height: 200px;
  overflow-y: auto;
}

.opcion {
  padding: 10px 15px;
  cursor: pointer;
  transition: background 0.2s;
}

.opcion:hover {
  background: #f1f8e9;
}

.opcion.seleccionada {
  background: #e8f5e9;
  color: #4CAF50;
  font-weight: bold;
}

.nombre-moneda {
  font-weight: normal;
  font-size: 0.85rem;
  color: #666;
}

.opcion:hover .nombre-moneda {
  color: #4CAF50;
}

.separador {
  height: 1px;
  background: #eee;
  margin: 5px 0;
}

button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.info-conversion {
  background: #f0fdf4;
  border-left: 4px solid #22c55e;
  padding: 15px;
  border-radius: 12px;
  margin-top: 20px;
  height: 100px;
  /* Altura fija para que no mueva el pie de la calculadora */
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.info-conversion p {
  margin: 5px 0;
  color: #333;
}

.tasa {
  font-size: 0.9rem;
  color: #666;
  font-style: italic;
}

.apis-info {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #a3d977;
  font-size: 0.85rem;
  color: #555;
}

.apis-info p {
  margin: 0;
}

.mensaje {
  padding: 15px;
  border-radius: 4px;
  text-align: center;
  margin-top: 20px;
}

.cargando {
  background: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
}

.error {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.calculadora-divisas b,
.calculadora-divisas strong {
  font-weight: 700;
}

.datepicker-inline {
  margin-top: 8px;
  width: 100%;
}

/* Ajuste para que el datepicker no se vea cortado si el contenedor es pequeño */
:deep(.dp__menu) {
  z-index: 9999;
}



@media (max-width: 600px) {
  .contenedor-principal {
    flex-direction: column;
    gap: 15px;
  }

  button {
    width: 100%;
  }
}
</style>
