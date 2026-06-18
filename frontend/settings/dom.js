// ─────────────────────────────────────────────
//  DOM NODE CACHE — avoids repeated querySelector
// ─────────────────────────────────────────────
export const D = {
  body:         document.body,
  symBtn:       document.getElementById('symBtn'),
  symIcon:      document.getElementById('symIcon'),
  symName:      document.getElementById('symName'),
  symChev:      document.getElementById('symChev'),
  coinDropdown: document.getElementById('coinDropdown'),
  coinSearch:   document.getElementById('coinSearch'),
  coinList:     document.getElementById('coinList'),
  priceVal:     document.getElementById('priceVal'),
  priceChg:     document.getElementById('priceChg'),
  tfGroup:      document.getElementById('tfGroup'),
  typeTrigger:  document.getElementById('typeTrigger'),
  typeLabel:    document.getElementById('typeLabel'),
  typeMenu:     document.getElementById('typeMenu'),
  overlayTrigger:document.getElementById('overlayTrigger'),
  overlayMenu:  document.getElementById('overlayMenu'),
  overlayBadge: document.getElementById('overlayBadge'),
  indTrigger:   document.getElementById('indTrigger'),
  indMenu:      document.getElementById('indMenu'),
  indBadge:     document.getElementById('indBadge'),
  btnDepth:     document.getElementById('btnDepth'),
  btnTheme:     document.getElementById('btnTheme'),
  btnSnap:      document.getElementById('btnSnap'),
  btnFull:      document.getElementById('btnFull'),
  btnSidebar:   document.getElementById('btnSidebar'),
  statusDot:    document.getElementById('statusDot'),
  statusTxt:    document.getElementById('statusTxt'),

  // Stats
  sOpen:document.getElementById('sOpen'), sHigh:document.getElementById('sHigh'),
  sLow:document.getElementById('sLow'),   sClose:document.getElementById('sClose'),
  sVol:document.getElementById('sVol'),   sEmaF:document.getElementById('sEmaF'),
  sEmaS:document.getElementById('sEmaS'), sRsi:document.getElementById('sRsi'),
  sAtr:document.getElementById('sAtr'),   sVwap:document.getElementById('sVwap'),
  sCount:document.getElementById('sCount'),

  // Canvases
  mainCanvas:    document.getElementById('mainCanvas'),
  vpCanvas:      document.getElementById('vpCanvas'),
  volCanvas:     document.getElementById('volCanvas'),
  rsiCanvas:     document.getElementById('rsiCanvas'),
  macdCanvas:    document.getElementById('macdCanvas'),
  stochCanvas:   document.getElementById('stochCanvas'),
  obvCanvas:     document.getElementById('obvCanvas'),
  depthCanvas:   document.getElementById('depthCanvas'),
  minimapCanvas: document.getElementById('minimapCanvas'),
  fngCanvas:     document.getElementById('fngCanvas'),

  // Chart panels
  depthDrawer:  document.getElementById('depthDrawer'),
  volPane:      document.getElementById('volPane'),
  volLabel:     document.getElementById('volLabel'),
  rsiPane:      document.getElementById('rsiPane'),
  rsiLabel:     document.getElementById('rsiLabel'),
  macdPane:     document.getElementById('macdPane'),
  stochPane:    document.getElementById('stochPane'),
  obvPane:      document.getElementById('obvPane'),

  // Sidebar
  sidebar:      document.getElementById('sidebar'),
  ohlcTooltip:  document.getElementById('ohlcTooltip'),
  btnSidebarClose: document.getElementById('btnSidebarClose'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),

  // Alerts
  alertPrice:   document.getElementById('alertPrice'),
  btnAlertAdd:  document.getElementById('btnAlertAdd'),
  alertList:    document.getElementById('alertList'),

  // Drawing
  leftBar:      document.getElementById('leftBar'),
  toolPalette:  document.getElementById('toolPalette'),
  drawInstr:    document.getElementById('drawInstr'),
  btnClearDrawings:   document.getElementById('btnClearDrawings'),
  btnClearDrawingsSB: document.getElementById('btnClearDrawingsSB'),

  // S/R
  chkSR:   document.getElementById('chkSR'),
  selSrTf: document.getElementById('selSrTf'),

  // Indicator inputs
  inpEmaFast:  document.getElementById('inpEmaFast'),
  inpEmaSlow:  document.getElementById('inpEmaSlow'),
  inpSmaPeriod:document.getElementById('inpSmaPeriod'),
  inpBbPeriod: document.getElementById('inpBbPeriod'),
  inpBbStd:    document.getElementById('inpBbStd'),
  inpRsiPeriod:document.getElementById('inpRsiPeriod'),
  inpMacdFast: document.getElementById('inpMacdFast'),
  inpMacdSlow: document.getElementById('inpMacdSlow'),
  inpMacdSig:  document.getElementById('inpMacdSig'),
  inpBullColor:document.getElementById('inpBullColor'),
  inpBearColor:document.getElementById('inpBearColor'),

  // Risk
  riskAccount: document.getElementById('riskAccount'),
  riskPct:     document.getElementById('riskPct'),
  riskEntry:   document.getElementById('riskEntry'),
  riskStop:    document.getElementById('riskStop'),
  riskTP:      document.getElementById('riskTP'),
  btnCalcRisk: document.getElementById('btnCalcRisk'),
  riskResults: document.getElementById('riskResults'),
  rcSize:      document.getElementById('rcSize'),
  rcRisk:      document.getElementById('rcRisk'),
  rcStopPct:   document.getElementById('rcStopPct'),
  rcRR:        document.getElementById('rcRR'),
  rcGain:      document.getElementById('rcGain'),
  rcBE:        document.getElementById('rcBE'),
  journalList: document.getElementById('journalList'),
  btnJournalExport: document.getElementById('btnJournalExport'),

  // Intel
  fngValue:    document.getElementById('fngValue'),
  fngLabel:    document.getElementById('fngLabel'),
  newsList:    document.getElementById('newsList'),
  newsTitle:   document.getElementById('newsTitle'),
  btnNewsFilter:document.getElementById('btnNewsFilter'),
  btnAddEvt:   document.getElementById('btnAddEvt'),
  addEvtForm:  document.getElementById('addEvtForm'),
  evtTitle:    document.getElementById('evtTitle'),
  evtDate:     document.getElementById('evtDate'),
  evtImpact:   document.getElementById('evtImpact'),
  btnSaveEvt:  document.getElementById('btnSaveEvt'),
  eventList:   document.getElementById('eventList'),

  // AI
  aiTrendBadge:document.getElementById('aiTrendBadge'),
  aiReasonsList:document.getElementById('aiReasonsList'),
  aiLongProb:  document.getElementById('aiLongProb'),
  aiShortProb: document.getElementById('aiShortProb'),
  aiLongBar:   document.getElementById('aiLongBar'),
  aiShortBar:  document.getElementById('aiShortBar'),
  aiLevelsList:document.getElementById('aiLevelsList'),
  aiTradeIdea: document.getElementById('aiTradeIdea'),

  // Context menu
  ctxMenu:  document.getElementById('ctxMenu'),
  ctxPrice: document.getElementById('ctxPrice'),
  ctxAlert: document.getElementById('ctxAlert'),
  ctxCopy:  document.getElementById('ctxCopy'),
  ctxReset: document.getElementById('ctxReset'),

  toastContainer: document.getElementById('toastContainer'),
  btnExportCSV:   document.getElementById('btnExportCSV'),
  minimapPanel:   document.getElementById('minimapPanel'),
};

// Canvas 2D Contexts
export const CTX = {
  main:    D.mainCanvas.getContext('2d'),
  vp:      D.vpCanvas.getContext('2d'),
  vol:     D.volCanvas.getContext('2d'),
  rsi:     D.rsiCanvas.getContext('2d'),
  macd:    D.macdCanvas.getContext('2d'),
  stoch:   D.stochCanvas.getContext('2d'),
  obv:     D.obvCanvas.getContext('2d'),
  depth:   D.depthCanvas.getContext('2d'),
  minimap: D.minimapCanvas.getContext('2d'),
  fng:     D.fngCanvas.getContext('2d'),
};
