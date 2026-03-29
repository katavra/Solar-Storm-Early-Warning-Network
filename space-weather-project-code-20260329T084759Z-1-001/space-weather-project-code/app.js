// Space Weather App Logic - Vanilla JS + Globe.gl

// Inject Deltoid Star Background
function createStars() {
    const container = document.createElement('div');
    container.id = 'stars-container';

    const starCount = 35; // Sparse — lots of space between stars
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';

        // Random position
        star.style.left = `${Math.random() * 100}vw`;
        star.style.top = `${Math.random() * 100}vh`;

        // Large deltoid stars: 20px – 50px wide
        const size = Math.random() * 30 + 20;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;

        // Slow, staggered pulse
        star.style.animationDuration = `${Math.random() * 5 + 5}s`;
        star.style.animationDelay = `${Math.random() * 6}s`;

        container.appendChild(star);
    }
    document.body.prepend(container);
}
createStars();


// NOAA API Endpoints
const API_K_INDEX = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const API_AURORA = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const API_PLASMA = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json';

// State
let isManualMode = false;
let currentKp = 0;
let currentSpeed = 400;
let lastAuroraData = null;
let riskChart = null;
let originalHistoricSpeeds = [];
let originalHistoricLabels = [];
let emergencyModalShown = false; // Only show once per session

// Initialize Chart.js
function initRiskChart() {
    const ctx = document.getElementById('riskChart');
    if (!ctx) return;


    riskChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Plazma Hızı (km/s)',
                data: [],
                borderColor: 'rgba(0, 255, 136, 1)', // Initial Green
                borderWidth: 2,
                tension: 0.4, // Smooth curve
                pointRadius: 0, // Hide dots for a cleaner wave
                pointHitRadius: 10,
                fill: true,
                backgroundColor: 'rgba(58, 134, 255, 0.05)' // subtle glow under line
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(10, 15, 30, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#00ff88',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94A3B8', maxTicksLimit: 6, font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94A3B8', font: { size: 10 } },
                    suggestedMin: 300,
                    suggestedMax: 800
                }
            }
        }
    });
}
initRiskChart();

function updateChartUI(kp, speed) {
    if (!riskChart || originalHistoricSpeeds.length === 0) return;

    const isRisky = speed > 500;
    const cColor = isRisky ? 'rgba(255, 85, 85, 1)' : 'rgba(0, 255, 136, 1)';
    const bColor = isRisky ? 'rgba(255, 85, 85, 0.1)' : 'rgba(0, 255, 136, 0.05)';

    // Calculate simulation "Shiver" (jitter) amount based on Kp and Speed
    // More intense storm = more visual noise in the data points
    const severityFactor = Math.max(0, (speed - 400) / 400) + (kp / 9);
    const noiseAmount = isManualMode ? severityFactor * 40 : 0; // Only jitter in manual simulation

    const jitteredData = originalHistoricSpeeds.map(val => {
        const jitter = (Math.random() - 0.5) * noiseAmount;
        return val + jitter;
    });

    riskChart.data.datasets[0].data = jitteredData;
    riskChart.data.datasets[0].borderColor = cColor;
    riskChart.data.datasets[0].backgroundColor = bColor;
    riskChart.update('none'); // Update without animation for continuous shivering if called frequently
}

// Initialize 3D Globe
const globeVizContainer = document.getElementById('globeViz');
const globeWrapper = document.getElementById('globeWrapper');

const world = Globe()
    (globeVizContainer)
    .width(globeWrapper.clientWidth)
    .height(globeWrapper.clientHeight)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png') /* Premium Starry Background */
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .showAtmosphere(true)
    .atmosphereColor('lightskyblue')
    .atmosphereAltitude(0.2)
    .pointAltitude('size')
    .pointColor('color')
    .pointRadius(0.8)
    .pointsMerge(true);

// Add auto-rotation
world.controls().autoRotate = true;
world.controls().autoRotateSpeed = 0.5;

// Interactive Coordinate Display & Point Analyzer
const coordDisplay = document.getElementById('coordinateDisplay');
const analysisDisplay = document.getElementById('pointAnalysisDisplay');

world.onGlobeClick(({ lat, lng }) => {
    coordDisplay.innerHTML = `Enlem: <span class="coord-highlight">${lat.toFixed(2)}&deg;</span><br>Boylam: <span class="coord-highlight">${lng.toFixed(2)}&deg;</span>`;
    coordDisplay.classList.add('visible');

    // Nearest Neighbor Detection for local point analysis
    const allPoints = world.pointsData(); // Retrieves currently rendered points array
    let closestPoint = null;
    let minDistance = Infinity;

    if (allPoints && allPoints.length > 0) {
        allPoints.forEach(p => {
            // Quick Euclidean geometry calculation for proximity
            let dx = Math.abs(p.lng - lng);
            if (dx > 180) dx = 360 - dx; // Wrap around for longitude
            let dy = p.lat - lat;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDistance) {
                minDistance = dist;
                closestPoint = p;
            }
        });
    }

    // Determine Risk Message
    let displayHtml = '';
    let borderColor = 'transparent';
    const detectionRadius = 6.0; // Search radius in degrees

    if (closestPoint && minDistance <= detectionRadius && closestPoint.color) {
        const color = closestPoint.color;

        if (color.includes('255, 50, 50')) {
            displayHtml = `<span class="title" style="color: #ff5555;">Kritik Tehdit</span>
                           Bu koordinat yüksek risk barındırıyor.<br>Şiddetli radyasyon veya manyetik fırtına dalgaları saptandı. Uydu parazitleri gerçekleşebilir.`;
            borderColor = '#ff5555';
        } else if (color.includes('255, 200, 0')) {
            displayHtml = `<span class="title" style="color: #ffcc00;">Orta Risk (Uyarı)</span>
                           Bu koordinatta dalgalanmalar seyrediyor.<br>Sıradışı jeomanyetik değişimler algılandı.`;
            borderColor = '#ffcc00';
        } else if (color.includes('0, 255, 100')) {
            displayHtml = `<span class="title" style="color: #00ff88;">Stabil Durum</span>
                           Bu koordinata düşen aurora tespiti güvenli seviyede ve stabil durumda. Risk teşkil etmiyor.`;
            borderColor = '#00ff88';
        } else {
            displayHtml = `<span class="title" style="color: var(--text-main);">Veri Tespit Edilemedi</span>
                           Veri tespit edilemedi.`;
            borderColor = 'rgba(255, 255, 255, 0.2)';
        }
    } else {
        // Safe Zone / Empty geometry
        displayHtml = `<span class="title" style="color: var(--text-muted);">Tehdit Sapması Yok</span>
                       Şu anda tıkladığınız bölgede fırtına etkisi görülmüyor. Stabil uzay havası.`;
        borderColor = 'rgba(255, 255, 255, 0.2)';
    }

    // Inject into DOM
    if (analysisDisplay) {
        analysisDisplay.innerHTML = displayHtml;
        analysisDisplay.style.borderLeftColor = borderColor;
        analysisDisplay.classList.add('visible');
    }
});

function getHazardColor(prob, kp, speed) {
    // 1. Calculate global severity multipliers
    const kFactor = Math.min(kp / 9, 1); // 0.0 to 1.0 (Kp 0-9)
    const sFactor = Math.max(0, Math.min((speed - 400) / 600, 1)); // 0.0 to 1.0 (Speed 400-1000)

    // 2. Global Storm Intensity inflates the underlying local probability
    // Multiplier scales from 1x (quiet) up to 3x (extreme storm)
    const severityMultiplier = 1.0 + kFactor + sFactor;
    const effectiveProb = prob * severityMultiplier;

    // 3. Evaluate colors based on effective Probability
    // Lower red threshold (40 instead of 60) so red covers a wider area
    if (effectiveProb > 40) return 'rgba(255, 50, 50, 0.9)';         // High Risk (Red)
    if (effectiveProb > 20) return 'rgba(255, 200, 0, 0.8)';         // Medium Risk (Yellow)
    return 'rgba(0, 255, 100, 0.4)';                                 // Low Risk (Green)
}

const COUNTRY_BOUNDS = [
    { name: 'Kanada', lat: [41, 83], lng: [-141, -52] },
    { name: 'ABD (Alaska)', lat: [51, 71], lng: [-179, -129] },
    { name: 'Kuzey Rusya', lat: [50, 81], lng: [19, 190] },
    { name: 'Norveç', lat: [57, 71], lng: [4, 31] },
    { name: 'İsveç', lat: [55, 69], lng: [10, 24] },
    { name: 'Finlandiya', lat: [59, 70], lng: [20, 31] },
    { name: 'İzlanda', lat: [63, 67], lng: [-25, -13] },
    { name: 'Grönland', lat: [59, 83], lng: [-73, -11] },
    { name: 'İskoçya (BK)', lat: [55, 61], lng: [-8, 0] },
    { name: 'Yeni Zelanda (Güney)', lat: [-47, -35], lng: [166, 178] },
    { name: 'Antarktika', lat: [-90, -60], lng: [-180, 180] }
];

function updateGlobePoints() {
    if (!lastAuroraData) return;

    const points = [];
    const countryRisks = {};

    // Initialize risks to 0
    COUNTRY_BOUNDS.forEach(c => countryRisks[c.name] = 0);

    // Dynamic threshold: at high Kp/speed even faint aurora zones become visible
    // At Kp=0 we only show aurora>2, at Kp=9 we show aurora>0.5
    const kFraction = Math.min(currentKp / 9, 1);
    const sFraction = Math.max(0, Math.min((currentSpeed - 400) / 600, 1));
    const stormIntensity = (kFraction + sFraction) / 2; // 0.0 quiet → 1.0 extreme
    const auroraThreshold = Math.max(0.5, 2 - stormIntensity * 1.5);

    lastAuroraData.forEach(coord => {
        let lng = coord[0];
        let lat = coord[1];
        let aurora = coord[2];

        // Only map areas above dynamic threshold
        if (aurora > auroraThreshold) {
            const adjustedLng = lng > 180 ? lng - 360 : lng;
            let pColor = getHazardColor(aurora, currentKp, currentSpeed);

            // Geographic Filter: at low storm intensity green only near poles (|lat|>45)
            // At extreme storm intensity, red can reach mid-latitudes (|lat|>20)
            const greenLatMin = 45;
            const redLatMin   = Math.max(20, 45 - stormIntensity * 25);

            if (pColor === 'rgba(0, 255, 100, 0.4)' && Math.abs(lat) < greenLatMin) {
                pColor = null;
            }
            if (pColor === 'rgba(255, 50, 50, 0.9)' && Math.abs(lat) < redLatMin) {
                pColor = null; // Don't show red at equatorial areas even at high Kp
            }

            // Derive numeric risk for calculations
            let riskLevel = 0;
            if (pColor === 'rgba(255, 50, 50, 0.9)') riskLevel = 3;
            else if (pColor === 'rgba(255, 200, 0, 0.8)') riskLevel = 2;
            else if (pColor === 'rgba(0, 255, 100, 0.4)') riskLevel = 1;

            // Check bounding boxes
            if (riskLevel > 0) {
                for (let i = 0; i < COUNTRY_BOUNDS.length; i++) {
                    const b = COUNTRY_BOUNDS[i];
                    if (lat >= b.lat[0] && lat <= b.lat[1] && adjustedLng >= b.lng[0] && adjustedLng <= b.lng[1]) {
                        if (riskLevel > countryRisks[b.name]) {
                            countryRisks[b.name] = riskLevel;
                        }
                    }
                }
            }

            // If the element has a valid color (is not safe/hidden), push it
            if (pColor) {
                // ── Break symmetry: randomly skip ~35% of points
                if (Math.random() < 0.35) return;

                // ── Polar-aware scatter
                const isPolar = Math.abs(lat) > 55;
                const baseJitter = isPolar ? 6 : 3;
                const extraJitter = (aurora / 100) * (isPolar ? 8 : 3);
                const totalJitter = baseJitter + extraJitter;

                const latJitter = (Math.random() - 0.5) * totalJitter;
                const lngJitter = (Math.random() - 0.5) * totalJitter * (isPolar ? 4 : 2);

                // Reduced size back to original, retaining slight organic variance
                const sizeVariance   = 0.6 + Math.random() * 0.8;

                points.push({
                    lat:   lat + latJitter,
                    lng:   adjustedLng + lngJitter,
                    size:  ((aurora / 100) * 0.15 + 0.01) * sizeVariance,
                    color: pColor,
                    raw:   aurora
                });
            }
        }
    });

    // Reverted base radius back to the original fixed scale
    world.pointRadius(0.8);

    // Update DOM Sidebar
    const listContainer = document.getElementById('countryRiskList');
    if (listContainer) {
        let html = '';
        // Sort countries by descending risk
        const sortedCountries = Object.keys(countryRisks)
            .map(name => ({ name, risk: countryRisks[name] }))
            .filter(c => c.risk > 0) // Only show affected countries
            .sort((a, b) => b.risk - a.risk);

        if (sortedCountries.length === 0) {
            html = '<div style="color:var(--text-muted); text-align:center; padding: 1rem;">Riskli Bölge Yok</div>';
        } else {
            sortedCountries.forEach(c => {
                let badgeClass = 'risk-badge green';
                let label = 'Düşük';
                if (c.risk === 3) { badgeClass = 'risk-badge red'; label = 'Yüksek'; }
                else if (c.risk === 2) { badgeClass = 'risk-badge yellow'; label = 'Orta'; }

                html += `
                    <div class="country-risk-item">
                        <span class="country-name">${c.name}</span>
                        <span class="${badgeClass}">${label}</span>
                    </div>
                `;
            });
        }
        listContainer.innerHTML = html;
    }

    world.pointsData(points);
}

function updateKIndexUI(recentKp) {
    const kIndexEl = document.getElementById('kIndexValue');
    const kStatusEl = document.getElementById('kIndexStatus');

    kIndexEl.textContent = recentKp.toFixed(1);
    kIndexEl.classList.remove('loading');

    // Update aesthetic based on severity
    kStatusEl.classList.remove('green', 'yellow', 'red');
    if (recentKp < 4) {
        kStatusEl.textContent = 'Normal';
        kStatusEl.classList.add('green');
        world.atmosphereColor('lightskyblue');
    } else if (recentKp < 7) {
        kStatusEl.textContent = 'Aktif (Hafif Fırtına)';
        kStatusEl.classList.add('yellow');
        world.atmosphereColor('orange');
    } else {
        kStatusEl.textContent = 'Şiddetli Fırtına Uyarısı';
        kStatusEl.classList.add('red');
        world.atmosphereColor('red');
        // Trigger emergency modal on critical K-Index (≥ 7)
        triggerEmergencyModal();
    }
}

function triggerEmergencyModal() {
    if (emergencyModalShown) return; // Don't show twice
    emergencyModalShown = true;

    // Reveal the persistent re-open button so user can reopen later
    const openBtn = document.getElementById('btnOpenEmergency');
    if (openBtn) openBtn.style.display = 'block';

    const modal = document.getElementById('emergencyModal');
    if (modal) modal.classList.remove('hidden');
}

function updateImpactTime(speedKmS) {
    if (!speedKmS || speedKmS <= 0) return;
    const distance = 150000000;
    const timeSeconds = distance / speedKmS;
    const timeHours = timeSeconds / 3600;

    const impactEl = document.getElementById('impactTimeValue');
    if (impactEl) {
        impactEl.textContent = timeHours.toFixed(1);
        impactEl.classList.remove('loading');
    }

    const impactSpeed = document.getElementById('impactSpeedStatus');
    if (impactSpeed) {
        impactSpeed.textContent = `Hız: ${speedKmS.toFixed(0)} km/s`;
    }
}

// --- Control Logic ---
const kIndexSlider = document.getElementById('manualKp');
const kIndexLabel = document.getElementById('manualKpLabel');
const modeBadge = document.getElementById('simModeBadge');
const waveSpeedInput = document.getElementById('waveSpeed');
const btnManual = document.getElementById('btnManual');
const btnLive = document.getElementById('btnLive');

kIndexSlider.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val)) {
        val = Math.max(0, Math.min(val, 9));
        kIndexLabel.textContent = val.toFixed(1);
    }
});

btnManual.addEventListener('click', () => {
    isManualMode = true;
    modeBadge.textContent = 'MANUEL';
    modeBadge.className = 'mode-badge manual';

    let uiChanged = false;

    // Apply Kp
    let kpVal = parseFloat(kIndexSlider.value);
    if (!isNaN(kpVal)) {
        kpVal = Math.max(0, Math.min(kpVal, 9));
        currentKp = kpVal;
        updateKIndexUI(kpVal);
        uiChanged = true;
    }

    // Apply Speed
    let speedVal = parseFloat(waveSpeedInput.value);
    if (!isNaN(speedVal) && speedVal > 0) {
        currentSpeed = speedVal;
        updateImpactTime(speedVal);
        uiChanged = true;
    }

    // Update map with manual simulation variables
    if (uiChanged) {
        updateGlobePoints();
        updateChartUI(currentKp, currentSpeed);
    }
});

btnLive.addEventListener('click', () => {
    isManualMode = false;
    modeBadge.textContent = 'CANLI';
    modeBadge.className = 'mode-badge';
    emergencyModalShown = false; // Allow modal to show again on live data update

    // Refetch NOAA data
    fetchNoaaData();
});

// Close button wiring
document.getElementById('closeEmergencyModal').addEventListener('click', () => {
    const modal = document.getElementById('emergencyModal');
    if (modal) modal.classList.add('hidden');
});

// Re-open button — always shows the modal regardless of shown state
document.getElementById('btnOpenEmergency').addEventListener('click', () => {
    const modal = document.getElementById('emergencyModal');
    if (modal) modal.classList.remove('hidden');
});

async function fetchNoaaData() {
    try {
        // Fetch K-Index
        const kResponse = await fetch(API_K_INDEX);
        const kData = await kResponse.json();

        // Data is [["time_tag","Kp",...], ["2026-03-21...", "7.00",...], ...]
        // Get the latest valid Kp reading
        const latestReading = kData[kData.length - 1];
        const recentKp = parseFloat(latestReading[1]);

        if (!isManualMode) {
            currentKp = recentKp;
            updateKIndexUI(recentKp);
        }

        // Fetch Aurora
        const aResponse = await fetch(API_AURORA);
        const aData = await aResponse.json();

        // Update Observation Time UI
        let obsDateObj = new Date(aData['Observation Time']);
        let dateStr = obsDateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        let timeStr = obsDateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // System current time to show fresh fetch
        let nowStr = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const obsEl = document.getElementById('auroraTime');
        obsEl.innerHTML = `
            <div style="font-size: 0.95em; text-align: left; margin: 0 auto; display: inline-block;">
                <div style="margin-bottom: 3px;"><span style="color: var(--text-muted); font-size: 0.85em; font-weight: 600; min-width: 45px; display: inline-block;">GÜN:</span> ${dateStr}</div>
                <div style="margin-bottom: 3px;"><span style="color: var(--text-muted); font-size: 0.85em; font-weight: 600; min-width: 45px; display: inline-block;">SAAT:</span> ${timeStr} <span style="font-size: 0.75em; opacity: 0.7;">(NOAA)</span></div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <span style="color: var(--accent-blue); font-size: 0.8em; font-weight: 800;">SON GÜNCELLEME:</span>
                    <span style="color: #fff; font-size: 0.85em; margin-left: 4px;">${nowStr}</span>
                </div>
            </div>
        `;
        obsEl.classList.remove('loading');

        // Store latest aurora data globally
        lastAuroraData = aData.coordinates;

        // Fetch Plasma / Solar Wind
        if (!isManualMode) {
            try {
                const pResponse = await fetch(API_PLASMA);
                const pData = await pResponse.json(); // pData is Array: [["time_tag","density","speed","temperature"], ...]

                let recentSpeed = 0;
                let historicSpeeds = [];
                let historicLabels = [];

                // Extract last 60 actual resolved readings (skip nulls if possible)
                for (let i = pData.length - 1; i >= 1; i--) {
                    if (pData[i][2] !== null) {
                        if (recentSpeed === 0) {
                            recentSpeed = parseFloat(pData[i][2]);
                        }

                        // Collect for chart (up to 60 valid points)
                        if (historicSpeeds.length < 60) {
                            historicSpeeds.unshift(parseFloat(pData[i][2]));

                            // Parse time label "2026-03-29 01:21:00.000" -> "01:21"
                            let rawTime = pData[i][0];
                            let shortTime = rawTime.split(' ')[1].substring(0, 5);
                            historicLabels.unshift(shortTime);
                        }
                    }
                }

                if (recentSpeed > 0) {
                    currentSpeed = recentSpeed;
                    updateImpactTime(recentSpeed);
                }

                // Update Risk Chart
                if (riskChart && historicSpeeds.length > 0) {
                    originalHistoricSpeeds = historicSpeeds;
                    originalHistoricLabels = historicLabels;

                    riskChart.data.labels = historicLabels;
                    updateChartUI(recentKp, recentSpeed);

                    // Conditionally scale the canvas y-axis to focus on the action
                    const maxS = Math.max(...historicSpeeds);
                    const minS = Math.min(...historicSpeeds);
                    riskChart.options.scales.y.suggestedMax = maxS > 600 ? maxS + 50 : 600;
                    riskChart.options.scales.y.suggestedMin = minS < 350 ? minS - 50 : 350;

                    riskChart.update();
                }

            } catch (err) {
                console.error("Error fetching Plasma data:", err);
            }
        }

        // Finally draw points with all resolved variables
        updateGlobePoints();

    } catch (err) {
        console.error("Error fetching Space Weather data:", err);
        document.getElementById('kIndexStatus').textContent = 'API Hatası';
        document.getElementById('auroraTime').textContent = 'API Hatası';
    }
}

// Ensure responsiveness
window.addEventListener('resize', () => {
    world.width(globeWrapper.clientWidth);
    world.height(globeWrapper.clientHeight);
});

// Init
fetchNoaaData();

// Poll every 1 minute (60000 ms) to keep space weather data extremely fresh
setInterval(fetchNoaaData, 60000);
