/* ═══════════════════════════════════════════════════════
   APEXTRADER ULTRA — THREE.JS WEBGL SPATIAL GRAPHICS
   Optimized 3D scenes with Viewport Lazy-Rendering
   ═══════════════════════════════════════════════════════ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (typeof THREE === 'undefined') {
    console.error('Three.js is not loaded. Skipping 3D visual modules.');
    return;
  }

  // Central Performance Manager to guarantee 60 FPS
  const renderManager = new ViewportRenderManager();

  // Register all WebGL scenes
  renderManager.register('hero', initHeroScene);
  renderManager.register('markets', initMarketsBgScene);
  renderManager.register('chart-hologram', initHologramChartScene);
  renderManager.register('metrics', initDataTowersScene);
  renderManager.register('brain', initNeuralBrainScene);
  renderManager.register('galaxy', initCryptoGalaxyScene);
  renderManager.register('howitworks', initWorkflowStationsScene);

  // Initialize Card hover tilts
  initCardTiltEffect();
});

// ══════════════════════════════════════════════════════
// CENTRAL VIEWPORT RENDER MANAGER (OBSERVER)
// ══════════════════════════════════════════════════════
class ViewportRenderManager {
  constructor() {
    this.scenes = [];
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const sceneObj = this.scenes.find(s => s.id === id);
        if (sceneObj) {
          sceneObj.active = entry.isIntersecting;
          if (entry.isIntersecting && !sceneObj.running) {
            sceneObj.animate();
          }
        }
      });
    }, { threshold: 0.05, rootMargin: '100px 0px 100px 0px' });
  }

  register(id, initFn) {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Find canvas container inside the section
    let container = el;
    if (id === 'hero') container = document.getElementById('hero3dScene');
    else if (id === 'markets') container = document.getElementById('marketsCanvasContainer');
    else if (id === 'chart-hologram') container = document.getElementById('hologramChartContainer');
    else if (id === 'metrics') container = document.getElementById('dataTowersContainer');
    else if (id === 'brain') container = document.getElementById('aiBrainContainer');
    else if (id === 'galaxy') container = document.getElementById('cryptoGalaxyContainer');
    else if (id === 'howitworks') container = document.getElementById('workflow3dContainer');

    if (!container) return;

    const sceneContext = initFn(container);
    if (sceneContext && typeof sceneContext.animate === 'function') {
      const sceneObj = {
        id,
        active: false,
        running: false,
        animate: () => {
          if (!sceneObj.active) {
            sceneObj.running = false;
            return;
          }
          sceneObj.running = true;
          sceneContext.animate();
          requestAnimationFrame(sceneObj.animate);
        }
      };
      this.scenes.push(sceneObj);
      this.observer.observe(el);
    }
  }
}

// Helper to create basic renderer
function createBaseRenderer(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }, { passive: true });

  return { scene, camera, renderer };
}


// ══════════════════════════════════════════════════════
// 1. HERO 3D SCENE (GLOWING BITCOIN + ORBITING HTML CARDS)
// ══════════════════════════════════════════════════════
function initHeroScene(container) {
  const { scene, camera, renderer } = createBaseRenderer(container);
  camera.position.set(0, 0, 8);

  // Lights
  scene.add(new THREE.AmbientLight(0xfff3e0, 0.5));
  const dirLight1 = new THREE.DirectionalLight(0xffd54f, 2.5);
  dirLight1.position.set(5, 5, 4);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x00e5ff, 1.5);
  dirLight2.position.set(-5, -5, 2);
  scene.add(dirLight2);

  // Hologram Bitcoin construction
  const btcGroup = new THREE.Group();
  scene.add(btcGroup);

  const btcMat = new THREE.MeshStandardMaterial({
    color: 0xf7931a,
    emissive: 0x5a2d00,
    metalness: 0.95,
    roughness: 0.1,
    wireframe: false
  });

  const btcWireMat = new THREE.MeshBasicMaterial({
    color: 0xffb74d,
    wireframe: true,
    transparent: true,
    opacity: 0.25
  });

  // Base coin cylinder
  const coinGeom = new THREE.CylinderGeometry(1.8, 1.8, 0.25, 32);
  const coinMesh = new THREE.Mesh(coinGeom, btcMat);
  coinMesh.rotation.x = Math.PI / 2;
  btcGroup.add(coinMesh);

  // Outer wireframe shell
  const wireShell = new THREE.Mesh(coinGeom, btcWireMat);
  wireShell.rotation.x = Math.PI / 2;
  wireShell.scale.set(1.05, 1.05, 1.05);
  btcGroup.add(wireShell);

  // Bitcoin Symbol details
  const symbolMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 0.9, roughness: 0.1 });
  const spineGeom = new THREE.BoxGeometry(0.25, 1.6, 0.4);
  const spine = new THREE.Mesh(spineGeom, symbolMat);
  spine.position.set(-0.35, 0, 0);
  btcGroup.add(spine);

  const curvesGeom1 = new THREE.TorusGeometry(0.38, 0.12, 8, 32, Math.PI);
  const curve1 = new THREE.Mesh(curvesGeom1, symbolMat);
  curve1.position.set(0.05, 0.38, 0.1);
  curve1.rotation.z = -Math.PI / 2;
  btcGroup.add(curve1);

  const curve2 = new THREE.Mesh(curvesGeom1, symbolMat);
  curve2.position.set(0.05, -0.38, 0.1);
  curve2.rotation.z = -Math.PI / 2;
  btcGroup.add(curve2);

  const prongGeom = new THREE.BoxGeometry(0.12, 1.9, 0.4);
  const prong1 = new THREE.Mesh(prongGeom, symbolMat);
  prong1.position.set(-0.1, 0, 0);
  btcGroup.add(prong1);
  const prong2 = new THREE.Mesh(prongGeom, symbolMat);
  prong2.position.set(0.15, 0, 0);
  btcGroup.add(prong2);

  // Orbit Paths
  const orbitGeom = new THREE.RingGeometry(2.8, 2.82, 64);
  const orbitMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.15 });
  const path = new THREE.Mesh(orbitGeom, orbitMat);
  path.rotation.x = Math.PI / 2.2;
  scene.add(path);

  // Floating particles
  const pCount = 80;
  const pGeom = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i*3] = (Math.random() - 0.5) * 12;
    pPos[i*3+1] = (Math.random() - 0.5) * 8;
    pPos[i*3+2] = (Math.random() - 0.5) * 5;
  }
  pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xffd54f, size: 0.08, transparent: true, opacity: 0.6 });
  const pSystem = new THREE.Points(pGeom, pMat);
  scene.add(pSystem);

  // Interactive mouse tracking
  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) - 0.5;
    mouseY = (e.clientY / window.innerHeight) - 0.5;
  }, { passive: true });

  const orbitCards = document.querySelectorAll('#orbitCardWrap .orbit-card');
  const clock = new THREE.Clock();

  return {
    animate: () => {
      const time = clock.getElapsedTime();

      // Slow Bitcoin rotation & bobbing
      btcGroup.rotation.y = time * 0.45;
      btcGroup.position.y = Math.sin(time * 1.2) * 0.12;
      wireShell.rotation.y = -time * 0.15;

      // Particle float
      const positions = pGeom.attributes.position.array;
      for (let i = 0; i < pCount; i++) {
        positions[i*3+1] -= 0.008;
        if (positions[i*3+1] < -4) positions[i*3+1] = 4;
      }
      pGeom.attributes.position.needsUpdate = true;

      // Parallax camera lerp
      camera.position.x += (mouseX * 3.5 - camera.position.x) * 0.08;
      camera.position.y += (-mouseY * 3.5 - camera.position.y) * 0.08;
      camera.lookAt(0, 0, 0);

      // Animate HTML cards orbiting in 3D
      if (orbitCards.length > 0) {
        const radiusX = 260; // orbit horizontal spread
        const radiusZ = 120; // depth spread
        const speed = 0.5;

        orbitCards.forEach((card, index) => {
          const baseAngle = (index * (2 * Math.PI) / orbitCards.length);
          const theta = baseAngle + time * speed;
          
          const x = Math.cos(theta) * radiusX;
          const z = Math.sin(theta) * radiusZ;
          const y = Math.sin(time * 1.5 + index) * 15;

          // Scale card dynamically based on Z depth position
          const scale = 0.75 + ((z + radiusZ) / (2 * radiusZ)) * 0.4;
          const opacity = 0.35 + ((z + radiusZ) / (2 * radiusZ)) * 0.65;
          const zIndex = Math.round(50 + ((z + radiusZ) / (2 * radiusZ)) * 50);

          card.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), ${z}px) scale(${scale})`;
          card.style.opacity = opacity;
          card.style.zIndex = zIndex;
        });
      }

      renderer.render(scene, camera);
    }
  };
}

// ══════════════════════════════════════════════════════
// 2. MARKETS BACKGROUND SCENE (FLOATING SPACE GRID)
// ══════════════════════════════════════════════════════
function initMarketsBgScene(container) {
  const { scene, camera, renderer } = createBaseRenderer(container);
  camera.position.set(0, 0, 5);

  // Soft grid helper in 3D
  const grid = new THREE.GridHelper(12, 24, 0x00f0ff, 0x070c14);
  grid.position.set(0, -1.8, -1);
  grid.rotation.x = 0.12;
  grid.material.transparent = true;
  grid.material.opacity = 0.15;
  scene.add(grid);

  // Drift starfield
  const starCount = 60;
  const starGeom = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i*3] = (Math.random() - 0.5) * 8;
    starPos[i*3+1] = (Math.random() - 0.5) * 6;
    starPos[i*3+2] = -Math.random() * 4;
  }
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0x00f0ff, size: 0.05, transparent: true, opacity: 0.35 });
  const stars = new THREE.Points(starGeom, starMat);
  scene.add(stars);

  const clock = new THREE.Clock();

  return {
    animate: () => {
      const time = clock.getElapsedTime();
      
      // Rotate grid slowly
      grid.rotation.z = time * 0.02;
      
      // Star sway
      const pos = starGeom.attributes.position.array;
      for (let i = 0; i < starCount; i++) {
        pos[i*3] += Math.sin(time + i) * 0.001;
      }
      starGeom.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    }
  };
}

// ══════════════════════════════════════════════════════
// 3. HOLOGRAM CHART SCENE (SUSPENDED WEBGL CANDLESTICKS)
// ══════════════════════════════════════════════════════
function initHologramChartScene(container) {
  const { scene, camera, renderer } = createBaseRenderer(container);
  camera.position.set(2, 2.5, 7.5);
  camera.lookAt(0, 0, 0);

  // Soft illumination
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const light = new THREE.DirectionalLight(0x00f0ff, 2.0);
  light.position.set(0, 4, 3);
  scene.add(light);

  const chartGroup = new THREE.Group();
  scene.add(chartGroup);

  // Generate 3D Candlestick mock array
  const candleCount = 20;
  const candles = [];
  const bullMat = new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x003c14, roughness: 0.1 });
  const bearMat = new THREE.MeshStandardMaterial({ color: 0xff3b6f, emissive: 0x3c0014, roughness: 0.1 });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x4a5b7c });

  let lastY = -0.5;

  for (let i = 0; i < candleCount; i++) {
    const x = -3.5 + (i * 0.38);
    const bodyHeight = 0.4 + Math.random() * 1.1;
    const isBull = Math.random() > 0.42;
    const y = lastY + (isBull ? 0.3 : -0.3) * (Math.random() * 1.5);
    lastY = y;

    // Body cube
    const bodyGeom = new THREE.BoxGeometry(0.22, bodyHeight, 0.22);
    const bodyMesh = new THREE.Mesh(bodyGeom, isBull ? bullMat : bearMat);
    bodyMesh.position.set(x, y, 0);
    chartGroup.add(bodyMesh);

    // Wick lines
    const points = [
      new THREE.Vector3(x, y - bodyHeight/2 - 0.3, 0),
      new THREE.Vector3(x, y + bodyHeight/2 + 0.3, 0)
    ];
    const wickGeom = new THREE.BufferGeometry().setFromPoints(points);
    const wick = new THREE.Line(wickGeom, lineMat);
    chartGroup.add(wick);

    candles.push({ body: bodyMesh, isBull, baseHeight: bodyHeight, y });
  }

  // Floating buy/sell energy indicators
  const pGeom = new THREE.ConeGeometry(0.12, 0.3, 4);
  const buyInd = new THREE.Mesh(pGeom, bullMat);
  buyInd.position.set(-2, -0.9, 0);
  chartGroup.add(buyInd);

  const sellInd = new THREE.Mesh(pGeom, bearMat);
  sellInd.rotation.x = Math.PI;
  sellInd.position.set(1.5, 1.2, 0);
  chartGroup.add(sellInd);

  // Flowing neon trend line path
  const curvePoints = candles.map(c => new THREE.Vector3(c.body.position.x, c.y, 0.15));
  const curve = new THREE.CatmullRomCurve3(curvePoints);
  const tubeGeom = new THREE.TubeGeometry(curve, 64, 0.035, 8, false);
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
  const tube = new THREE.Mesh(tubeGeom, tubeMat);
  chartGroup.add(tube);

  const clock = new THREE.Clock();

  return {
    animate: () => {
      const time = clock.getElapsedTime();

      // Rotate whole chart group slightly in space
      chartGroup.rotation.y = Math.sin(time * 0.3) * 0.15;
      chartGroup.rotation.x = 0.08 + Math.cos(time * 0.35) * 0.05;

      // Pulse indicator pyradmids
      buyInd.position.y = -0.9 + Math.sin(time * 4) * 0.08;
      buyInd.rotation.y = time * 2;
      sellInd.position.y = 1.2 + Math.cos(time * 4) * 0.08;
      sellInd.rotation.y = time * 2;

      // Wobble candles slightly (projection dynamic simulation)
      candles.forEach((c, idx) => {
        c.body.scale.y = 1 + Math.sin(time * 1.5 + idx) * 0.06;
      });

      renderer.render(scene, camera);
    }
  };
}

// ══════════════════════════════════════════════════════
// 4. DATA TOWERS SCENE (GROW ON SCROLL)
// ══════════════════════════════════════════════════════
function initDataTowersScene(container) {
  const { scene, camera, renderer } = createBaseRenderer(container);
  camera.position.set(0, 3.5, 7.5);
  camera.lookAt(0, 1.2, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const light = new THREE.DirectionalLight(0xffa726, 2.5);
  light.position.set(4, 5, 2);
  scene.add(light);

  const towers = [];
  const spacing = 1.8;
  const towerMatGold = new THREE.MeshStandardMaterial({ color: 0xf7931a, emissive: 0x4a2a00, roughness: 0.15 });
  const towerMatCyan = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x003e4f, roughness: 0.15 });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.08 });

  // Create 4 data towers representing statistics
  for (let i = 0; i < 4; i++) {
    const x = -2.7 + (i * spacing);
    const towerH = 1.8 + (Math.sin(i * 1.5) + 1.2) * 1.2;

    const towerGroup = new THREE.Group();
    towerGroup.position.set(x, 0, 0);
    scene.add(towerGroup);

    // Cylinder base
    const geom = new THREE.CylinderGeometry(0.38, 0.38, towerH, 6);
    const mat = (i % 2 === 0) ? towerMatGold : towerMatCyan;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = towerH / 2;
    towerGroup.add(mesh);

    // Outer wireframe helper shell
    const outerShell = new THREE.Mesh(geom, wireMat);
    outerShell.position.y = towerH / 2;
    outerShell.scale.set(1.12, 1, 1.12);
    towerGroup.add(outerShell);

    // Beacon point light at the top of the tower
    const beaconMat = new THREE.MeshBasicMaterial({ color: mat.color });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), beaconMat);
    beacon.position.y = towerH;
    towerGroup.add(beacon);

    towers.push({ group: towerGroup, targetHeight: towerH, mesh, outerShell, beacon });
    
    // Set initial scale to zero height for grow animation
    towerGroup.scale.y = 0.01;
  }

  // Hook up to GSAP ScrollTrigger to grow towers on scroll
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    towers.forEach((tower, idx) => {
      gsap.to(tower.group.scale, {
        y: 1,
        duration: 1.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '#metrics',
          start: 'top 80%',
          toggleActions: 'play none none none'
        },
        delay: idx * 0.25
      });
    });
  } else {
    // Fallback if GSAP is not ready
    towers.forEach(t => t.group.scale.y = 1);
  }

  const clock = new THREE.Clock();

  return {
    animate: () => {
      const time = clock.getElapsedTime();
      
      towers.forEach((t, idx) => {
        // Spin wireframes
        t.outerShell.rotation.y = time * 0.25;
        // Bob beacon light slightly
        t.beacon.position.y = t.targetHeight + Math.sin(time * 4 + idx) * 0.05;
      });

      renderer.render(scene, camera);
    }
  };
}

// ══════════════════════════════════════════════════════
// 5. AI NEURAL BRAIN SCENE (SPHERE CORE + PARTICLE SYSTEM)
// ══════════════════════════════════════════════════════
function initNeuralBrainScene(container) {
  const { scene, camera, renderer } = createBaseRenderer(container);
  camera.position.set(0, 0, 5.5);

  // Soft light
  scene.add(new THREE.AmbientLight(0x7c3aed, 0.45));
  const light = new THREE.PointLight(0x00f0ff, 2.5, 10);
  light.position.set(0, 0, 2);
  scene.add(light);

  const brainGroup = new THREE.Group();
  scene.add(brainGroup);

  // Central Core Node
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6,
    emissive: 0x3a005f,
    roughness: 0.1,
    metalness: 0.95
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82, 2), coreMat);
  brainGroup.add(core);

  // Spherical Neural shell particle network
  const pCount = 150;
  const pGeom = new THREE.SphereGeometry(2.0, 16, 16);
  const pMat = new THREE.PointsMaterial({
    color: 0x00f0ff,
    size: 0.09,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });
  const network = new THREE.Points(pGeom, pMat);
  brainGroup.add(network);

  // Draw wire connections between nodes
  const wireGeom = new THREE.IcosahedronGeometry(2.0, 2);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x8b5cf6,
    wireframe: true,
    transparent: true,
    opacity: 0.18
  });
  const wires = new THREE.Mesh(wireGeom, wireMat);
  brainGroup.add(wires);

  // Interactive mouse shift parallax
  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) - 0.5;
    mouseY = (e.clientY / window.innerHeight) - 0.5;
  }, { passive: true });

  const clock = new THREE.Clock();

  return {
    animate: () => {
      const time = clock.getElapsedTime();

      // Spin whole group
      brainGroup.rotation.y = time * 0.18;
      brainGroup.rotation.x = time * 0.08;

      // Pulse core size
      const coreScale = 1.0 + Math.sin(time * 3.5) * 0.08;
      core.scale.setScalar(coreScale);

      // Camera shift
      camera.position.x += (mouseX * 1.5 - camera.position.x) * 0.06;
      camera.position.y += (-mouseY * 1.5 - camera.position.y) * 0.06;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
  };
}

// ══════════════════════════════════════════════════════
// 6. CRYPTO GALAXY (INTERACTIVE ORBITING PLANETS)
// ══════════════════════════════════════════════════════
function initCryptoGalaxyScene(container) {
  const { scene, camera, renderer } = createBaseRenderer(container);
  camera.position.set(2, 4.5, 7.5);
  camera.lookAt(0, 0, 0);

  // Ambient stars
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const light = new THREE.PointLight(0xffffff, 3.5, 15);
  light.position.set(0, 0, 0);
  scene.add(light);

  const solarGroup = new THREE.Group();
  scene.add(solarGroup);

  // Central Sun Core (Market Cap)
  const sunGeom = new THREE.SphereGeometry(0.75, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.95 });
  const sun = new THREE.Mesh(sunGeom, sunMat);
  solarGroup.add(sun);

  // Orbit path outlines
  const pathsGroup = new THREE.Group();
  solarGroup.add(pathsGroup);

  // Planet specifications
  const planetsData = [
    { name: 'Bitcoin',  symbol: 'BTC/USDT', icon: '₿', core: 'Golden Core', dominance: '54.8%', status: 'Active Peak', radius: 1.6, size: 0.28, color: 0xf7931a, speed: 0.42, ring: false, mesh: null },
    { name: 'Ethereum', symbol: 'ETH/USDT', icon: 'Ξ', core: 'Blue Energy',  dominance: '18.2%', status: 'Stable',      radius: 2.3, size: 0.24, color: 0x00f0ff, speed: 0.32, ring: true,  mesh: null },
    { name: 'Solana',   symbol: 'SOL/USDT', icon: '◎', core: 'Purple Core',  dominance: '4.8%',  status: 'Volatile',    radius: 3.1, size: 0.20, color: 0x8b5cf6, speed: 0.26, ring: false, mesh: null },
    { name: 'XRP',      symbol: 'XRP/USDT', icon: '✕', core: 'Cyan Core',    dominance: '2.1%',  status: 'Accumulating',radius: 3.8, size: 0.16, color: 0x00e5ff, speed: 0.20, ring: false, mesh: null },
    { name: 'BNB',      symbol: 'BNB/USDT', icon: '⬡', core: 'Yellow Facet', dominance: '3.6%',  status: 'Neutral',     radius: 4.5, size: 0.22, color: 0xffea00, speed: 0.16, ring: false, mesh: null },
  ];

  planetsData.forEach(p => {
    // Path circle ring
    const pathGeom = new THREE.RingGeometry(p.radius, p.radius + 0.015, 64);
    const pathMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.06 });
    const orbitPath = new THREE.Mesh(pathGeom, pathMat);
    orbitPath.rotation.x = Math.PI / 2;
    pathsGroup.add(orbitPath);

    // Planet pivot group
    const planetPivot = new THREE.Group();
    solarGroup.add(planetPivot);

    // Planet Sphere Mesh
    const pGeom = new THREE.SphereGeometry(p.size, 32, 32);
    const pMat = new THREE.MeshStandardMaterial({
      color: p.color,
      roughness: 0.15,
      metalness: 0.85,
      emissive: p.color,
      emissiveIntensity: 0.22
    });
    const pMesh = new THREE.Mesh(pGeom, pMat);
    pMesh.position.set(p.radius, 0, 0);
    pMesh.userData = p; // store mapping specs directly inside mesh
    planetPivot.add(pMesh);
    p.mesh = pMesh;
    p.pivot = planetPivot;

    // Optional planet rings (e.g. Ethereum)
    if (p.ring) {
      const ringGeom = new THREE.TorusGeometry(p.size * 1.6, 0.02, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.set(p.radius, 0, 0);
      planetPivot.add(ringMesh);
    }
  });

  // Interactive Raycasting Setup
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let activeHoverPlanet = null;

  // Track mouse coordinates
  window.addEventListener('mousemove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }, { passive: true });

  // Handle Planet Clicks to update HTML Details Card
  window.addEventListener('click', () => {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(solarGroup.children, true);
    
    // Find intersected planet mesh
    const planetInter = intersects.find(i => i.object.userData && i.object.userData.name);
    if (planetInter) {
      const data = planetInter.object.userData;
      updateGalaxyInfoCard(data);
    }
  });

  // Dynamically update Details Card
  function updateGalaxyInfoCard(data) {
    const icon = document.getElementById('gicIcon');
    const name = document.getElementById('gicName');
    const sym = document.getElementById('gicSymbol');
    const coreVal = document.getElementById('gicCore');
    const vol = document.getElementById('gicVol');
    const dom = document.getElementById('gicDom');
    const status = document.getElementById('gicStatus');

    if (icon) {
      icon.textContent = data.icon;
      icon.style.color = '#' + data.color.toString(16);
      icon.style.borderColor = 'rgba(' + [
        (data.color >> 16) & 255,
        (data.color >> 8) & 255,
        data.color & 255,
        0.3
      ].join(',') + ')';
    }
    if (name) name.textContent = data.name;
    if (sym) sym.textContent = data.symbol;
    if (coreVal) {
      coreVal.textContent = data.core;
      coreVal.className = 'gic-val';
      coreVal.style.color = '#' + data.color.toString(16);
    }
    if (dom) dom.textContent = data.dominance;
    if (status) status.textContent = data.status;

    // Trigger slight flash effect on card
    const card = document.getElementById('galaxyInfoCard');
    if (card) {
      card.style.borderColor = '#' + data.color.toString(16);
      setTimeout(() => {
        card.style.borderColor = 'rgba(247, 147, 26, 0.2)';
      }, 500);
    }
  }

  const clock = new THREE.Clock();

  return {
    animate: () => {
      const time = clock.getElapsedTime();

      // Orbit planets
      planetsData.forEach(p => {
        p.pivot.rotation.y = time * p.speed;
        p.mesh.rotation.y = time * 1.5; // rotate self
      });

      // Central core pulse
      const sunPulse = 1.0 + Math.sin(time * 2.5) * 0.05;
      sun.scale.setScalar(sunPulse);

      // Perform Raycaster Hover Check
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(solarGroup.children, true);
      const hoverPlanet = intersects.find(i => i.object.userData && i.object.userData.name);

      if (hoverPlanet) {
        const mesh = hoverPlanet.object;
        if (activeHoverPlanet !== mesh) {
          if (activeHoverPlanet) activeHoverPlanet.scale.setScalar(1);
          activeHoverPlanet = mesh;
          mesh.scale.setScalar(1.28); // inflate
          document.body.style.cursor = 'pointer';
        }
      } else {
        if (activeHoverPlanet) {
          activeHoverPlanet.scale.setScalar(1);
          activeHoverPlanet = null;
        }
        document.body.style.cursor = 'default';
      }

      renderer.render(scene, camera);
    }
  };
}

// ══════════════════════════════════════════════════════
// 7. 3D WORKFLOW PIPELINE (CONNECTED ROTATING NODES)
// ══════════════════════════════════════════════════════
function initWorkflowStationsScene(container) {
  const { scene, camera, renderer } = createBaseRenderer(container);
  camera.position.set(0, 0, 5.5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const light = new THREE.PointLight(0x00f0ff, 2.0, 10);
  light.position.set(0, 2, 2);
  scene.add(light);

  const stationsGroup = new THREE.Group();
  scene.add(stationsGroup);

  const stationCount = 5;
  const spacing = 1.6;
  const polyhedras = [];
  const nodeMatGold = new THREE.MeshStandardMaterial({ color: 0xf7931a, metalness: 0.9, roughness: 0.1 });
  const nodeMatCyan = new THREE.MeshStandardMaterial({ color: 0x00f0ff, metalness: 0.9, roughness: 0.1 });

  // 1. Create 5 rotating stations
  for (let i = 0; i < stationCount; i++) {
    const x = -3.2 + (i * spacing);
    const isGold = i % 2 === 0;

    // Use different high-poly geometries
    let geom;
    if (i === 0) geom = new THREE.IcosahedronGeometry(0.35, 0);
    else if (i === 1) geom = new THREE.OctahedronGeometry(0.35, 0);
    else if (i === 2) geom = new THREE.DodecahedronGeometry(0.35, 0);
    else if (i === 3) geom = new THREE.TetrahedronGeometry(0.35, 0);
    else geom = new THREE.OctahedronGeometry(0.35, 0);

    const mesh = new THREE.Mesh(geom, isGold ? nodeMatGold : nodeMatCyan);
    mesh.position.set(x, 0, 0);
    stationsGroup.add(mesh);

    // Outer orbiting rings
    const ringGeom = new THREE.TorusGeometry(0.5, 0.015, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: isGold ? 0xf7931a : 0x00f0ff, transparent: true, opacity: 0.3 });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.set(x, 0, 0);
    ring.rotation.x = Math.PI / 2.2;
    stationsGroup.add(ring);

    polyhedras.push({ mesh, ring, isGold });
  }

  // 2. Connect stations with laser energy beams
  const linePoints = [];
  for (let i = 0; i < stationCount; i++) {
    const x = -3.2 + (i * spacing);
    linePoints.push(new THREE.Vector3(x, 0, 0));
  }
  const beamCurve = new THREE.CatmullRomCurve3(linePoints);
  const beamGeom = new THREE.TubeGeometry(beamCurve, 64, 0.02, 8, false);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.65
  });
  const laserBeam = new THREE.Mesh(beamGeom, beamMat);
  stationsGroup.add(laserBeam);

  const clock = new THREE.Clock();

  return {
    animate: () => {
      const time = clock.getElapsedTime();

      // Rotate nodes individually
      polyhedras.forEach((p, idx) => {
        p.mesh.rotation.y = time * 0.6 + idx;
        p.mesh.rotation.x = time * 0.3 + idx;
        p.ring.rotation.z = -time * 0.45;
        p.mesh.position.y = Math.sin(time * 2 + idx) * 0.06;
      });

      // Slowly tilt workflow panel
      stationsGroup.rotation.y = Math.sin(time * 0.3) * 0.08;

      renderer.render(scene, camera);
    }
  };
}

// ══════════════════════════════════════════════════════
// 8. 3D CARD HOVER TILT WITH DYNAMIC REFLECTION
// ══════════════════════════════════════════════════════
function initCardTiltEffect() {
  const cards = document.querySelectorAll('.market-card, .price-card, .testimonial-card-3d, .wf-card');
  if (!cards.length) return;

  const maxTilt = 10; // max tilt angle in degrees

  cards.forEach(card => {
    // Check if card has glare, if not create overlay
    let glare = card.querySelector('.pc-glare');
    if (!glare) {
      glare = document.createElement('div');
      glare.classList.add('pc-glare');
      card.appendChild(glare);
    }

    card.style.transformStyle = 'preserve-3d';
    card.style.transition = 'transform 0.15s ease, border-color 0.3s, box-shadow 0.3s';

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const relX = (x / rect.width) - 0.5;
      const relY = (y / rect.height) - 0.5;

      const rotX = -relY * maxTilt;
      const rotY = relX * maxTilt;

      card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.03, 1.03, 1.03) translateZ(10px)`;
      
      // Calculate custom coordinates for dynamic radial gradients inside card
      card.style.setProperty('--mx', x + 'px');
      card.style.setProperty('--my', y + 'px');

      // Glare overlay coordinate mapping
      glare.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 65%)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.4s ease, border-color 0.3s, box-shadow 0.3s';
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)';
      glare.style.background = 'transparent';
    });
  });
}
