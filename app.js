document.addEventListener('DOMContentLoaded', function () {
    // --- CONFIGURACIÓN INICIAL ---
    mapboxgl.accessToken = 'pk.eyJ1IjoiYWZlbGlwZm8iLCJhIjoiY21lcnF1cXh2MDllMDJscHk2eHFxMmVsdSJ9.afb7XVzY_ZAQcu0JLS9xaA';

    const reportContent = document.getElementById('report-content');
    const searchInput = document.getElementById('comuna-search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const infoSidebar = document.getElementById('info-sidebar');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const locateBtn = document.getElementById('locate-btn');
    const resetViewBtn = document.getElementById('reset-view-btn'); // NUEVO: Botón de reset

    let comunasData = null;
    let hoveredComunaId = null;
    let userMarker = null;

    // --- INICIALIZACIÓN DEL MAPA ---
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v11', // Estilo premium claro
        center: [-75.5636, 6.2518],
        zoom: 11.5,
        pitch: 45, // Menos inclinación para mejor lectura
        bearing: -17.6,
        antialias: true
    });

    // --- CONTROLES DEL MAPA ---
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // --- CARGA DE DATOS Y RENDERIZADO DEL MAPA ---
    map.on('load', async () => {
        try {
            const response = await fetch('comunas.geojson');
            comunasData = await response.json();

            initializeMapLayers();
            setupInteractions();
            loadCorregimientosMenu(); // Cargar menú después de obtener datos

        } catch (error) {
            console.error("Error cargando los datos de las comunas:", error);
            console.error("No se pudo cargar el archivo comunas.geojson. Asegúrate de que el archivo exista en la misma carpeta.");
        }
    });

    // --- LÓGICA DE CORREGIMIENTOS (MENU LATERAL DINÁMICO) ---
    const corregimientosList = document.getElementById('corregimientos-list');

    function loadCorregimientosMenu() {
        if (!corregimientosList || !comunasData) return;

        // Filtrar solo corregimientos (IDs >= 50) y ordenar
        const corregimientos = comunasData.features
            .map(f => f.properties)
            .filter(p => parseInt(p.IDENTIFICADOR) >= 50)
            .sort((a, b) => parseInt(a.IDENTIFICADOR) - parseInt(b.IDENTIFICADOR));

        corregimientos.forEach(corr => {
            const item = document.createElement('div');
            item.className = 'p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors duration-200 flex items-center gap-3 border border-gray-200';

            // Limpiar nombre si es muy largo para el menú
            const displayName = corr.NOMBRE.replace('Corregimiento ', '').replace(/^[0-9]+ - /, '');

            item.innerHTML = `
                <div class="bg-white p-2 rounded-full shadow-sm text-orange-500">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
                <div>
                    <div class="font-bold text-gray-700 text-sm">${displayName}</div>
                    <div class="text-xs text-gray-500">ID: ${corr.IDENTIFICADOR}</div>
                </div>
            `;

            item.addEventListener('click', () => {
                showComunaInfo(corr);
            });

            corregimientosList.appendChild(item);
        });
    }
    function initializeMapLayers() {
        if (!comunasData) return;

        map.addSource('comunas-source', {
            'type': 'geojson',
            'data': comunasData,
            'generateId': true
        });

        // 1. CAPA COMUNAS (POLÍGONOS) - IDs < 50
        map.addLayer({
            'id': 'comunas-fill',
            'type': 'fill',
            'source': 'comunas-source',
            'filter': ['<', ['to-number', ['get', 'IDENTIFICADOR']], 50],
            'paint': {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    '#FF9800', // Naranja al hover
                    '#42A5F5'  // Azul base
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.7,
                    0.4
                ]
            }
        });

        // Bordes de Comunas
        map.addLayer({
            'id': 'comunas-borders',
            'type': 'line',
            'source': 'comunas-source',
            'filter': ['<', ['to-number', ['get', 'IDENTIFICADOR']], 50],
            'paint': {
                'line-color': '#FFFFFF',
                'line-width': 2
            }
        });

        // Etiquetas de Comunas
        map.addLayer({
            'id': 'comunas-labels',
            'type': 'symbol',
            'source': 'comunas-source',
            'filter': ['<', ['to-number', ['get', 'IDENTIFICADOR']], 50],
            'layout': {
                'text-field': ['get', 'NOMBRE'],
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 12,
                'text-transform': 'uppercase'
            },
            'paint': {
                'text-color': '#1a3c5e',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2
            }
        });

        // 2. CAPA CORREGIMIENTOS (MARCADORES/CÍRCULOS) - IDs >= 50
        // Usamos círculos para evitar la geometría poligonal pequeña
        map.addLayer({
            'id': 'corregimientos-markers',
            'type': 'circle',
            'source': 'comunas-source',
            'filter': ['>=', ['to-number', ['get', 'IDENTIFICADOR']], 50],
            'paint': {
                'circle-radius': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    12, // Más grande al hover
                    8   // Tamaño normal
                ],
                'circle-color': '#FF5722', // Color distintivo para zona rural
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF'
            }
        });

        // Etiquetas para Corregimientos
        map.addLayer({
            'id': 'corregimientos-labels',
            'type': 'symbol',
            'source': 'comunas-source',
            'filter': ['>=', ['to-number', ['get', 'IDENTIFICADOR']], 50],
            'layout': {
                'text-field': ['get', 'NOMBRE'],
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 11,
                'text-offset': [0, 1.5], // Etiqueta debajo del punto
                'text-anchor': 'top'
            },
            'paint': {
                'text-color': '#D84315',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2
            }
        });
    }

    // --- INTERACCIONES DEL MAPA Y UI ---

    // --- INTERACCIONES DEL MAPA Y UI ---
    // --- INTERACCIONES DEL MAPA Y UI ---
    function setupInteractions() {
        const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'comuna-popup'
        });

        // --- INTERACCIONES PARA COMUNAS (CAPA DE RELLENO) ---
        map.on('mousemove', 'comunas-fill', handleMouseMove);
        map.on('mouseleave', 'comunas-fill', handleMouseLeave);
        map.on('click', 'comunas-fill', handleClick);

        // --- INTERACCIONES PARA CORREGIMIENTOS (CAPA DE CÍRCULOS) ---
        map.on('mousemove', 'corregimientos-markers', handleMouseMove);
        map.on('mouseleave', 'corregimientos-markers', handleMouseLeave);
        map.on('click', 'corregimientos-markers', handleClick);

        // Funciones auxiliares para eventos (DRY)
        function handleMouseMove(e) {
            map.getCanvas().style.cursor = 'pointer';
            if (e.features.length > 0) {
                if (hoveredComunaId !== null) {
                    map.setFeatureState({ source: 'comunas-source', id: hoveredComunaId }, { hover: false });
                }
                hoveredComunaId = e.features[0].id;
                map.setFeatureState({ source: 'comunas-source', id: hoveredComunaId }, { hover: true });

                // Mostrar Popup solo si es necesario (opcional, ya hay etiquetas)
                // const properties = e.features[0].properties;
                // popup.setLngLat(e.lngLat).setHTML(`<div class="comuna-popup-title">${properties.NOMBRE}</div>`).addTo(map);
            }
        }

        function handleMouseLeave() {
            map.getCanvas().style.cursor = '';
            if (hoveredComunaId !== null) {
                map.setFeatureState({ source: 'comunas-source', id: hoveredComunaId }, { hover: false });
            }
            hoveredComunaId = null;
            popup.remove();
        }

        function handleClick(e) {
            if (e.features.length > 0) {
                const feature = e.features[0];
                showComunaInfo(feature.properties);
            }
        }

        // Resto de controles...
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('focus', handleSearch);
        document.addEventListener('click', (e) => {
            if (!searchResultsContainer.contains(e.target) && e.target !== searchInput) {
                searchResultsContainer.classList.add('hidden');
            }
        });

        closeSidebarBtn.addEventListener('click', () => {
            infoSidebar.classList.add('-translate-x-full');
        });

        locateBtn.addEventListener('click', handleLocate);

        // Botón Reset View
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => {
                map.flyTo({
                    center: [-75.5636, 6.2518],
                    zoom: 11.5,
                    pitch: 45,
                    bearing: -17.6,
                    essential: true
                });
                infoSidebar.classList.add('-translate-x-full');
            });
        }
    }

    function handleSearch(e) {
        const query = e.target.value.toLowerCase();
        if (!comunasData || query.length < 1) {
            searchResultsContainer.classList.add('hidden');
            return;
        }

        const filtered = comunasData.features.filter(feature =>
            feature.properties.NOMBRE.toLowerCase().includes(query)
        );

        searchResultsContainer.innerHTML = '';
        if (filtered.length > 0) {
            filtered.forEach(feature => {
                const item = document.createElement('div');
                // CORRECCIÓN: Usar la clase .result-item para aplicar estilos de styles.css
                item.className = 'result-item';
                item.textContent = feature.properties.NOMBRE;
                item.addEventListener('click', () => {
                    showComunaInfo(feature.properties);
                    searchInput.value = '';
                    searchResultsContainer.classList.add('hidden');
                });
                searchResultsContainer.appendChild(item);
            });
            searchResultsContainer.classList.remove('hidden');
        } else {
            searchResultsContainer.classList.add('hidden');
        }
    }

    // --- NUEVA LÓGICA DE GEOLOCALIZACIÓN ---
    function handleLocate() {
        if (!navigator.geolocation) {
            alert('La geolocalización no es soportada por tu navegador.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { longitude, latitude } = position.coords;
                const userPoint = [longitude, latitude];

                // Añadir o mover el marcador del usuario
                if (userMarker) {
                    userMarker.setLngLat(userPoint);
                } else {
                    userMarker = new mapboxgl.Marker({ color: '#FF5733' })
                        .setLngLat(userPoint)
                        .addTo(map);
                }

                // Encontrar la comuna que contiene la ubicación del usuario
                const foundComuna = comunasData.features.find(feature =>
                    pointInPolygon(userPoint, feature.geometry.coordinates[0])
                );

                if (foundComuna) {
                    showComunaInfo(foundComuna.properties);
                } else {
                    alert('Tu ubicación actual está fuera de los límites de las comunas de Medellín.');
                    map.flyTo({ center: userPoint, zoom: 14 });
                }
            },
            (error) => {
                alert('No se pudo obtener tu ubicación. Asegúrate de haber concedido los permisos.');
                console.error("Error de Geolocalización:", error);
            }
        );
    }

    // Función para detectar si un punto está dentro de un polígono (algoritmo ray-casting)
    function pointInPolygon(point, polygon) {
        let x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            let xi = polygon[i][0], yi = polygon[i][1];
            let xj = polygon[j][0], yj = polygon[j][1];

            let intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // --- FIN DE LA NUEVA LÓGICA ---

    function showComunaInfo(properties) {
        const feature = comunasData.features.find(f => f.properties.IDENTIFICADOR === properties.IDENTIFICADOR);
        if (feature) {
            const coordinates = feature.geometry.coordinates[0];
            const bounds = coordinates.reduce((bounds, coord) => {
                return bounds.extend(coord);
            }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

            map.fitBounds(bounds, {
                padding: { top: 100, bottom: 100, left: infoSidebar.offsetWidth + 50, right: 50 },
                pitch: 65,
                duration: 2000
            });
        }

        reportContent.innerHTML = `
            <div class="p-4">
                <h2 class="text-3xl font-extrabold text-gray-800 border-b-4 border-orange-500 pb-3 mb-6">${properties.NOMBRE}</h2>
                <div class="space-y-4 text-lg">
                    <p><strong class="text-gray-700">Identificador:</strong> ${properties.IDENTIFICADOR}</p>
                    <p class="text-gray-600 leading-relaxed">Haz clic en el botón de abajo para generar el reporte detallado de esta comuna.</p>
                </div>
                <button id="generate-pdf-btn" class="w-full mt-8 bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-all duration-300 flex items-center justify-center gap-3 text-lg">
                    <i class="fas fa-file-pdf"></i> Generar Reporte PDF
                </button>
            </div>
        `;

        document.getElementById('generate-pdf-btn').addEventListener('click', () => {
            generatePDFFromHTMLFile(properties);
        });

        infoSidebar.classList.remove('-translate-x-full');
    }

    async function generatePDFFromHTMLFile(comunaProperties) {
        const pdfButton = document.getElementById('generate-pdf-btn');
        const fileName = `data/comuna${comunaProperties.IDENTIFICADOR}.html`;
        const pdfFileName = `Reporte-${comunaProperties.NOMBRE.replace(/ /g, '_')}.pdf`;

        pdfButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando reporte...';
        pdfButton.disabled = true;

        let tempContainer;

        try {
            const response = await fetch(fileName);
            if (!response.ok) throw new Error(`HTML not found: ${fileName}`);
            const htmlContent = await response.text();

            tempContainer = document.createElement('div');
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.style.top = '0';
            tempContainer.style.width = '800px';
            tempContainer.innerHTML = htmlContent;
            document.body.appendChild(tempContainer);

            pdfButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando PDF...';

            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await html2canvas(tempContainer, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            document.body.removeChild(tempContainer);
            tempContainer = null;

            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;

            const imgHeightOnPDF = pdfWidth / ratio;
            let heightLeft = imgHeightOnPDF;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightOnPDF);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position -= pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightOnPDF);
                heightLeft -= pdfHeight;
            }

            pdf.save(pdfFileName);

        } catch (error) {
            console.error('Error generando el PDF:', error);
            alert(`No se pudo generar el reporte. Asegúrate de que el archivo "${fileName}" exista.`);
        } finally {
            if (tempContainer && document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
            }

            pdfButton.innerHTML = '<i class="fas fa-file-pdf"></i> Generar Reporte PDF';
            pdfButton.disabled = false;
        }
    }
});