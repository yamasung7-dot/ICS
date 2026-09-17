// ICS — Immortal Cursed Spirit
// Mobile optimization + camera-aware 2D-inspired silhouette outlines.
// Outline philosophy: a 3D outline should represent the outer contour that
// would be seen in the final 2D image, not a copied/expanded model.

(function () {
    'use strict';

    const VERSION = '0.15.0';
    const PLUGIN_ID = 'ics';
    const TOOLBAR_ID = 'main_tools';
    const MENU_ID = 'ics_feature_menu';
    const MOBILE_OPTIMIZER_ID = 'ics_mobile_optimizer';
    const MOBILE_OPTIMIZER_ACTION_ID = 'ics_mobile_optimizer_action';
    const OUTLINE_ACTION_ID = 'ics_outlines_action';
    const OUTLINE_SETTINGS_ACTION_ID = 'ics_outline_settings_action';
    const OUTLINE_OBJECT_KEY = '__ics_outline';
    const OUTLINE_SETTINGS_KEY = 'ics_outline_settings';

    const DEFAULT_OUTLINE_THICKNESS = 0.12;
    const DEFAULT_OUTLINE_COLOR = '#111111';
    const DEFAULT_OUTLINE_TYPE = 'hazard_shell';

    const OUTLINE_STYLES = {
        hazard_shell: { name: 'Hazard Shell', opacity: 0.95, dashed: true, dashSize: 0.35, gapSize: 0.16 },
        ink: { name: 'Ink', opacity: 1, dashed: false, dashSize: 0, gapSize: 0 },
        sketch: { name: 'Sketch', opacity: 0.96, dashed: false, dashSize: 0, gapSize: 0 }
    };

    const tools = [];
    const actions = [];
    const originalPixelRatios = new Map();

    let mobileOptimizationEnabled = false;
    let originalPreviewRender = null;
    let cameraListenerInstalled = false;
    let outlinesEnabled = false;
    let outlineThickness = DEFAULT_OUTLINE_THICKNESS;
    let outlineColor = DEFAULT_OUTLINE_COLOR;
    let outlineType = DEFAULT_OUTLINE_TYPE;

    function safeDelete(item) {
        try { if (item && typeof item.delete === 'function') item.delete(); }
        catch (error) { console.warn('[ICS] Cleanup failed:', error); }
    }

    function removeMenuHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;
            menu.structure = (menu.structure || []).filter(item =>
                item && item.id !== MENU_ID && !String(item.id || '').startsWith('ics_')
            );
            menu.update?.(true);
        } catch (error) { console.warn('[ICS] Menu cleanup failed:', error); }
    }

    function returnToMoveTool() {
        try {
            if (typeof BarItems !== 'undefined' && BarItems.move_tool?.select) BarItems.move_tool.select();
        } catch (error) {}
    }

    function createFeature(id, name, icon, handler) {
        const tool = new Tool(id, {
            name, icon, category: 'tools', toolbar: TOOLBAR_ID,
            transformerMode: 'hidden',
            modes: ['edit', 'paint', 'display', 'animate', 'pose'],
            onSelect() {
                try { handler?.(); }
                catch (error) {
                    console.error('[ICS] Feature failed:', id, error);
                    Blockbench.showQuickMessage('ICS feature failed');
                }
                returnToMoveTool();
            }
        });
        tools.push(tool);
        return tool;
    }

    function createFeatureAction(id, name, icon, handler) {
        const action = new Action(id, {
            name, icon,
            click() {
                try { handler?.(); }
                catch (error) {
                    console.error('[ICS] Feature action failed:', id, error);
                    Blockbench.showQuickMessage('ICS feature failed');
                }
            }
        });
        actions.push(action);
        return action;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // MOBILE OPTIMIZATION -------------------------------------------------

    function calculatePixelRatio(preview) {
        const camera = preview?.camera;
        if (!camera) return 1;

        if (camera.isOrthographicCamera) {
            const zoom = Math.max(0.01, Number(camera.zoom) || 0.5);
            return clamp(0.3 + clamp(Math.sqrt(zoom / 0.5), 0, 1) * 0.7, 0.3, 1);
        }

        const target = preview?.controls?.target;
        let distance = 40;
        if (camera.position && target && typeof camera.position.distanceTo === 'function') {
            distance = camera.position.distanceTo(target);
        } else if (camera.position && typeof camera.position.length === 'function') {
            distance = camera.position.length();
        }

        const nearDistance = 20;
        const farDistance = 320;
        const normalized = clamp(
            (Math.log(farDistance) - Math.log(Math.max(nearDistance, distance))) /
            (Math.log(farDistance) - Math.log(nearDistance)),
            0, 1
        );
        return clamp(0.3 + normalized * 0.7, 0.3, 1);
    }

    function applyOptimizationToPreview(preview) {
        if (!mobileOptimizationEnabled || !preview) return;
        const renderer = preview.renderer;
        if (!renderer || typeof renderer.setPixelRatio !== 'function') return;

        if (!originalPixelRatios.has(renderer)) {
            originalPixelRatios.set(
                renderer,
                typeof renderer.getPixelRatio === 'function'
                    ? renderer.getPixelRatio()
                    : (window.devicePixelRatio || 1)
            );
        }

        const desiredRatio = calculatePixelRatio(preview);
        const currentRatio = typeof renderer.getPixelRatio === 'function'
            ? renderer.getPixelRatio()
            : null;

        if (currentRatio === null || Math.abs(currentRatio - desiredRatio) > 0.01) {
            renderer.setPixelRatio(desiredRatio);
        }
    }

    function applyOptimizationToAllPreviews() {
        try {
            const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all)
                ? Preview.all : [];
            for (const preview of previews) applyOptimizationToPreview(preview);
        } catch (error) {
            console.warn('[ICS] Mobile optimization update failed:', error);
        }
    }

    function installRenderHook() {
        if (
            typeof Preview === 'undefined' || !Preview.prototype ||
            typeof Preview.prototype.render !== 'function' || originalPreviewRender
        ) return;

        originalPreviewRender = Preview.prototype.render;
        Preview.prototype.render = function () {
            if (mobileOptimizationEnabled) applyOptimizationToPreview(this);
            return originalPreviewRender.apply(this, arguments);
        };
    }

    function removeRenderHook() {
        try {
            if (originalPreviewRender && typeof Preview !== 'undefined' && Preview.prototype?.render) {
                Preview.prototype.render = originalPreviewRender;
            }
        } catch (error) {
            console.warn('[ICS] Render hook cleanup failed:', error);
        }
        originalPreviewRender = null;
    }

    function onCameraPositionUpdate(event) {
        if (mobileOptimizationEnabled) {
            const preview = event?.preview;
            if (preview) {
                applyOptimizationToPreview(preview);
                try { preview.render?.(); } catch (error) {}
            } else {
                applyOptimizationToAllPreviews();
            }
        }

        // Silhouette is a 2D property of the current camera, so its edge set
        // must be recalculated when the camera moves.
        if (outlinesEnabled) refreshAllOutlineGeometry();
    }

    function installCameraListener() {
        if (!cameraListenerInstalled && typeof Blockbench?.on === 'function') {
            Blockbench.on('update_camera_position', onCameraPositionUpdate);
            cameraListenerInstalled = true;
        }
    }

    function removeCameraListener() {
        try {
            if (cameraListenerInstalled && typeof Blockbench?.removeListener === 'function') {
                Blockbench.removeListener('update_camera_position', onCameraPositionUpdate);
            }
        } catch (error) {}
        cameraListenerInstalled = false;
    }

    function setMobileOptimization(enabled) {
        mobileOptimizationEnabled = !!enabled;

        if (mobileOptimizationEnabled) {
            installRenderHook();
            installCameraListener();
            applyOptimizationToAllPreviews();
        } else {
            removeRenderHook();
            try {
                for (const [renderer, ratio] of originalPixelRatios) {
                    if (renderer?.setPixelRatio) renderer.setPixelRatio(ratio);
                }
            } catch (error) {}
            originalPixelRatios.clear();
        }

        Blockbench.showQuickMessage(
            'ICS Mobile Optimization: ' + (mobileOptimizationEnabled ? 'ON' : 'OFF')
        );
    }

    function toggleMobileOptimization() {
        setMobileOptimization(!mobileOptimizationEnabled);
    }

    // OUTLINE SETTINGS ----------------------------------------------------

    function loadOutlineSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(OUTLINE_SETTINGS_KEY) || 'null');
            if (!saved) return;

            const thickness = Number(saved.thickness);
            if (Number.isFinite(thickness)) outlineThickness = clamp(thickness, 0.01, 0.5);
            if (typeof saved.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) outlineColor = saved.color;
            if (typeof saved.type === 'string' && OUTLINE_STYLES[saved.type]) outlineType = saved.type;
        } catch (error) {
            console.warn('[ICS] Could not load outline settings:', error);
        }
    }

    function saveOutlineSettings() {
        try {
            localStorage.setItem(OUTLINE_SETTINGS_KEY, JSON.stringify({
                type: outlineType,
                thickness: outlineThickness,
                color: outlineColor
            }));
        } catch (error) {}
    }

    function getCurrentOutlineStyle() {
        return OUTLINE_STYLES[outlineType] || OUTLINE_STYLES[DEFAULT_OUTLINE_TYPE];
    }

    function getOutlineStyleOptions() {
        const options = {};
        for (const [id, style] of Object.entries(OUTLINE_STYLES)) options[id] = style.name;
        return options;
    }

    function openOutlineSettings() {
        const dialog = new Dialog({
            id: 'ics_outline_settings',
            title: 'ICS Outline Settings',
            form: {
                type: { label: 'Outline Type', type: 'select', options: getOutlineStyleOptions(), value: outlineType },
                thickness: { label: 'Outline Size', type: 'range', min: 0.01, max: 0.5, step: 0.01, value: outlineThickness },
                color: { label: 'Outline Color', type: 'color', value: outlineColor }
            },
            onConfirm(form) {
                if (typeof form.type === 'string' && OUTLINE_STYLES[form.type]) outlineType = form.type;
                const thickness = Number(form.thickness);
                const color = String(form.color || '');
                if (Number.isFinite(thickness)) outlineThickness = clamp(thickness, 0.01, 0.5);
                if (/^#[0-9a-f]{6}$/i.test(color)) outlineColor = color;

                saveOutlineSettings();
                if (outlinesEnabled) refreshAllOutlineGeometry();
                Blockbench.showQuickMessage('ICS ' + getCurrentOutlineStyle().name + ' Applied');
            }
        });
        dialog.show();
    }

    // SILHOUETTE ENGINE ---------------------------------------------------
    //
    // The old implementation expanded a complete duplicate of every mesh.
    // That is fundamentally the wrong representation of a 2D outline:
    // concave faces, overlapping planes and backfaces could become visible.
    //
    // ICS 0.15 instead builds only camera-facing contour edges. The outline
    // is a LineSegments object sitting on the real mesh surface and remains
    // depth-tested by Three.js. It is therefore an actual silhouette rather
    // than a stretched copy of the model.

    function makePositionKey(x, y, z) {
        const epsilon = 0.0001;
        return Math.round(x / epsilon) + ',' + Math.round(y / epsilon) + ',' + Math.round(z / epsilon);
    }

    function getTriangleData(source) {
        const position = source?.attributes?.position;
        if (!position || position.count < 3) return null;

        const vertices = [];
        const groups = new Map();
        const remap = new Uint32Array(position.count);

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
            const key = makePositionKey(x, y, z);
            let target = groups.get(key);
            if (target === undefined) {
                target = vertices.length / 3;
                groups.set(key, target);
                vertices.push(x, y, z);
            }
            remap[i] = target;
        }

        const index = source.index;
        const triangles = [];
        const readIndex = i => index?.count ? index.getX(i) : i;

        const addTriangle = (a, b, c) => {
            const ra = remap[a], rb = remap[b], rc = remap[c];
            if (ra === rb || rb === rc || rc === ra) return;

            const ax = vertices[ra * 3], ay = vertices[ra * 3 + 1], az = vertices[ra * 3 + 2];
            const bx = vertices[rb * 3], by = vertices[rb * 3 + 1], bz = vertices[rb * 3 + 2];
            const cx = vertices[rc * 3], cy = vertices[rc * 3 + 1], cz = vertices[rc * 3 + 2];

            const abx = bx - ax, aby = by - ay, abz = bz - az;
            const acx = cx - ax, acy = cy - ay, acz = cz - az;
            const nx = aby * acz - abz * acy;
            const ny = abz * acx - abx * acz;
            const nz = abx * acy - aby * acx;
            const length = Math.hypot(nx, ny, nz);
            if (length < 1e-10) return;

            triangles.push({
                a: ra, b: rb, c: rc,
                nx: nx / length, ny: ny / length, nz: nz / length,
                cx: (ax + bx + cx) / 3,
                cy: (ay + by + cy) / 3,
                cz: (az + bz + cz) / 3
            });
        };

        const count = index?.count || position.count;
        for (let i = 0; i + 2 < count; i += 3) {
            addTriangle(readIndex(i), readIndex(i + 1), readIndex(i + 2));
        }

        return { vertices, triangles };
    }

    function getCameraInLocalSpace(mesh, camera) {
        if (!mesh || !camera) return null;

        try {
            mesh.updateWorldMatrix?.(true, false);
            camera.updateWorldMatrix?.(true, false);
            const inverse = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
            const point = new THREE.Vector3();

            if (camera.isPerspectiveCamera) {
                camera.getWorldPosition(point);
                return point.applyMatrix4(inverse);
            }

            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            camera.getWorldPosition(point);
            point.add(direction.multiplyScalar(-10000));
            return point.applyMatrix4(inverse);
        } catch (error) {
            return null;
        }
    }

    function buildSilhouetteLineGeometry(mesh, camera) {
        if (typeof THREE === 'undefined' || !mesh?.geometry || !camera) return null;

        const data = getTriangleData(mesh.geometry);
        if (!data || !data.triangles.length) return null;

        const cameraLocal = getCameraInLocalSpace(mesh, camera);
        if (!cameraLocal) return null;

        const edgeMap = new Map();
        const addEdge = (a, b, faceIndex) => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            const key = lo + ':' + hi;
            let edge = edgeMap.get(key);
            if (!edge) {
                edge = { a: lo, b: hi, faces: [] };
                edgeMap.set(key, edge);
            }
            edge.faces.push(faceIndex);
        };

        for (let i = 0; i < data.triangles.length; i++) {
            const triangle = data.triangles[i];
            addEdge(triangle.a, triangle.b, i);
            addEdge(triangle.b, triangle.c, i);
            addEdge(triangle.c, triangle.a, i);
        }

        const front = new Uint8Array(data.triangles.length);
        for (let i = 0; i < data.triangles.length; i++) {
            const face = data.triangles[i];
            const dx = cameraLocal.x - face.cx;
            const dy = cameraLocal.y - face.cy;
            const dz = cameraLocal.z - face.cz;
            front[i] = (face.nx * dx + face.ny * dy + face.nz * dz) > 0 ? 1 : 0;
        }

        const linePositions = [];
        for (const edge of edgeMap.values()) {
            const faces = edge.faces;
            let useEdge = faces.length === 1;

            if (!useEdge && faces.length > 1) {
                let hasFront = false, hasBack = false;
                for (const faceIndex of faces) {
                    if (front[faceIndex]) hasFront = true;
                    else hasBack = true;
                }
                useEdge = hasFront && hasBack;
            }

            if (!useEdge) continue;

            const a = edge.a * 3, b = edge.b * 3;
            linePositions.push(
                data.vertices[a], data.vertices[a + 1], data.vertices[a + 2],
                data.vertices[b], data.vertices[b + 1], data.vertices[b + 2]
            );
        }

        if (!linePositions.length) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        geometry.computeBoundingSphere?.();
        return geometry;
    }

    function makeOutlineMaterial() {
        if (typeof THREE === 'undefined') return null;
        const style = getCurrentOutlineStyle();

        try {
            const material = style.dashed
                ? new THREE.LineDashedMaterial({
                    color: outlineColor,
                    transparent: true,
                    opacity: style.opacity,
                    depthTest: true,
                    depthWrite: false,
                    toneMapped: false,
                    dashSize: Math.max(0.01, outlineThickness * 3 * style.dashSize),
                    gapSize: Math.max(0.01, outlineThickness * 3 * style.gapSize)
                })
                : new THREE.LineBasicMaterial({
                    color: outlineColor,
                    transparent: true,
                    opacity: style.opacity,
                    depthTest: true,
                    depthWrite: false,
                    toneMapped: false
                });

            material.name = 'ICS ' + style.name + ' Silhouette Outline';
            return material;
        } catch (error) {
            console.warn('[ICS] Could not create silhouette material:', error);
            return null;
        }
    }

    function disposeOutlineObject(outline) {
        try {
            if (!outline) return;
            if (outline.parent) outline.parent.remove(outline);
            outline.geometry?.dispose?.();
            outline.material?.dispose?.();
        } catch (error) {
            console.warn('[ICS] Outline cleanup failed:', error);
        }
    }

    function getActiveCamera() {
        try {
            if (typeof Canvas !== 'undefined' && Canvas.camera) return Canvas.camera;
        } catch (error) {}

        try {
            if (typeof Preview !== 'undefined' && Array.isArray(Preview.all)) {
                for (const preview of Preview.all) if (preview?.camera) return preview.camera;
            }
        } catch (error) {}

        return null;
    }

    function createOutlineForMesh(mesh, camera) {
        if (!mesh?.isMesh || !mesh.geometry || !camera) return null;

        try {
            const geometry = buildSilhouetteLineGeometry(mesh, camera);
            if (!geometry) return null;

            const material = makeOutlineMaterial();
            if (!material) {
                geometry.dispose?.();
                return null;
            }

            const outline = new THREE.LineSegments(geometry, material);
            outline.name = 'ics_silhouette_outline';
            outline.userData = { icsOutline: true };
            outline.renderOrder = 999;
            outline.frustumCulled = mesh.frustumCulled;

            if (material.isLineDashedMaterial) geometry.computeLineDistances?.();

            mesh.add(outline);
            mesh.userData = mesh.userData || {};
            mesh.userData[OUTLINE_OBJECT_KEY] = outline;
            mesh.userData.icsOutlineSourceGeometry = mesh.geometry;
            mesh.userData.icsOutlineCamera = camera;
            return outline;
        } catch (error) {
            console.warn('[ICS] Could not create silhouette outline:', error);
            return null;
        }
    }

    function rebuildOutlineForMesh(mesh, camera) {
        if (!mesh?.isMesh || !mesh.geometry || !camera) return;
        const existing = mesh.userData?.[OUTLINE_OBJECT_KEY];
        if (existing) disposeOutlineObject(existing);

        if (mesh.userData) {
            delete mesh.userData[OUTLINE_OBJECT_KEY];
            delete mesh.userData.icsOutlineSourceGeometry;
            delete mesh.userData.icsOutlineCamera;
        }

        createOutlineForMesh(mesh, camera);
    }

    function refreshAllOutlineGeometry() {
        if (!outlinesEnabled) return;

        try {
            const camera = getActiveCamera();
            if (!camera) return;

            const elements = typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)
                ? Outliner.elements : [];

            for (const element of elements) {
                const object = element?.mesh;
                if (!object?.traverse) continue;
                object.traverse(child => {
                    if (!child?.isMesh || child.userData?.icsOutline) return;
                    rebuildOutlineForMesh(child, camera);
                });
            }
        } catch (error) {
            console.warn('[ICS] Silhouette refresh failed:', error);
        }
    }

    function updateAllOutlineMaterials() {
        if (!outlinesEnabled) return;

        try {
            const elements = typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)
                ? Outliner.elements : [];

            for (const element of elements) {
                const object = element?.mesh;
                if (!object?.traverse) continue;
                object.traverse(child => {
                    if (!child?.userData?.icsOutline) return;
                    const replacement = makeOutlineMaterial();
                    if (!replacement) return;
                    if (replacement.isLineDashedMaterial) child.geometry.computeLineDistances?.();
                    child.material?.dispose?.();
                    child.material = replacement;
                });
            }
        } catch (error) {
            console.warn('[ICS] Outline material update failed:', error);
        }
    }

    function removeOutlineFromMesh(mesh) {
        if (!mesh?.userData) return;
        const outline = mesh.userData[OUTLINE_OBJECT_KEY];
        if (!outline) return;
        disposeOutlineObject(outline);
        delete mesh.userData[OUTLINE_OBJECT_KEY];
        delete mesh.userData.icsOutlineSourceGeometry;
        delete mesh.userData.icsOutlineCamera;
    }

    function removeAllOutlines() {
        try {
            const elements = typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)
                ? Outliner.elements : [];
            for (const element of elements) {
                const object = element?.mesh;
                if (object?.traverse) object.traverse(child => removeOutlineFromMesh(child));
            }
        } catch (error) {
            console.warn('[ICS] Outline removal failed:', error);
        }
    }

    function setOutlinesEnabled(enabled) {
        outlinesEnabled = !!enabled;
        if (outlinesEnabled) {
            refreshAllOutlineGeometry();
            Blockbench.showQuickMessage('ICS Outlines: ON');
        } else {
            removeAllOutlines();
            Blockbench.showQuickMessage('ICS Outlines: OFF');
        }
    }

    function toggleOutlines() {
        setOutlinesEnabled(!outlinesEnabled);
    }

    function cleanup() {
        outlinesEnabled = false;
        removeAllOutlines();
        setMobileOptimization(false);
        removeCameraListener();
        removeRenderHook();
        originalPixelRatios.clear();
        removeMenuHierarchy();
        while (actions.length) safeDelete(actions.pop());
        while (tools.length) safeDelete(tools.pop());
        returnToMoveTool();
    }

    function buildHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;
            removeMenuHierarchy();
            menu.structure.push({ id: MENU_ID, name: 'ICS', icon: 'memory', children: actions.slice() });
            menu.update?.(true);
        } catch (error) {}
    }

    Plugin.register(PLUGIN_ID, {
        title: 'ICS — Immortal Cursed Spirit',
        author: 'TFO',
        description: 'Mobile optimization and camera-aware silhouette outlines for Blockbench.',
        about: '',
        version: VERSION,
        icon: 'memory',
        variant: 'both',
        min_version: '4.0.0',

        onload() {
            loadOutlineSettings();
            createFeature(MOBILE_OPTIMIZER_ID, 'Mobile Optimization', 'speed', toggleMobileOptimization);
            createFeatureAction(MOBILE_OPTIMIZER_ACTION_ID, 'Mobile Optimization', 'speed', toggleMobileOptimization);
            createFeatureAction(OUTLINE_ACTION_ID, 'Outlines', 'border_all', toggleOutlines);
            createFeatureAction(OUTLINE_SETTINGS_ACTION_ID, 'Outline Settings', 'settings', openOutlineSettings);
            installCameraListener();
            buildHierarchy();
            Blockbench.showQuickMessage('ICS v' + VERSION + ' loaded');
        },

        oninstall() {},
        onuninstall() { cleanup(); },
        onunload() { cleanup(); }
    });
})();
