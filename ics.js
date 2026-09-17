// ICS — Immortal Cursed Spirit
// Mobile optimization + 2D-inspired renderer-side outline styles.
// Outline philosophy: preserve the visual meaning of the outer 2D contour.

(function () {
    'use strict';

    const VERSION = '0.14.0';
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
        hazard_shell: { name: 'Hazard Shell', thicknessScale: 1, opacity: 0.95, mode: 0, variation: 0, perspective: 0, texture: 0 },
        ink: { name: 'Ink', thicknessScale: 0.9, opacity: 1, mode: 1, variation: 0.22, perspective: 0.85, texture: 0 },
        sketch: { name: 'Sketch', thicknessScale: 0.84, opacity: 0.98, mode: 2, variation: 0.34, perspective: 0.7, texture: 1 }
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
    let pencilTexture = null;

    function safeDelete(item) { try { if (item && typeof item.delete === 'function') item.delete(); } catch (error) { console.warn('[ICS] Cleanup failed:', error); } }

    function removeMenuHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;
            menu.structure = (menu.structure || []).filter(item => item && item.id !== MENU_ID && !String(item.id || '').startsWith('ics_'));
            menu.update?.(true);
        } catch (error) { console.warn('[ICS] Menu cleanup failed:', error); }
    }

    function returnToMoveTool() { try { if (typeof BarItems !== 'undefined' && BarItems.move_tool?.select) BarItems.move_tool.select(); } catch (error) {} }

    function createFeature(id, name, icon, handler) {
        const tool = new Tool(id, {
            name, icon, category: 'tools', toolbar: TOOLBAR_ID, transformerMode: 'hidden',
            modes: ['edit', 'paint', 'display', 'animate', 'pose'],
            onSelect() {
                try { handler?.(); } catch (error) { console.error('[ICS] Feature failed:', id, error); Blockbench.showQuickMessage('ICS feature failed'); }
                returnToMoveTool();
            }
        });
        tools.push(tool); return tool;
    }

    function createFeatureAction(id, name, icon, handler) {
        const action = new Action(id, { name, icon, click() { try { handler?.(); } catch (error) { console.error('[ICS] Feature action failed:', id, error); Blockbench.showQuickMessage('ICS feature failed'); } } });
        actions.push(action); return action;
    }

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

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
        if (camera.position && target && typeof camera.position.distanceTo === 'function') distance = camera.position.distanceTo(target);
        else if (camera.position && typeof camera.position.length === 'function') distance = camera.position.length();
        const nearDistance = 20, farDistance = 320;
        const normalized = clamp((Math.log(farDistance) - Math.log(Math.max(nearDistance, distance))) / (Math.log(farDistance) - Math.log(nearDistance)), 0, 1);
        return clamp(0.3 + normalized * 0.7, 0.3, 1);
    }

    function applyOptimizationToPreview(preview) {
        if (!mobileOptimizationEnabled || !preview) return;
        const renderer = preview.renderer;
        if (!renderer || typeof renderer.setPixelRatio !== 'function') return;
        if (!originalPixelRatios.has(renderer)) originalPixelRatios.set(renderer, typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : (window.devicePixelRatio || 1));
        const desiredRatio = calculatePixelRatio(preview);
        const currentRatio = typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : null;
        if (currentRatio === null || Math.abs(currentRatio - desiredRatio) > 0.01) renderer.setPixelRatio(desiredRatio);
    }

    function applyOptimizationToAllPreviews() {
        try { const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all) ? Preview.all : []; for (const preview of previews) applyOptimizationToPreview(preview); }
        catch (error) { console.warn('[ICS] Mobile optimization update failed:', error); }
    }

    function installRenderHook() {
        if (typeof Preview === 'undefined' || !Preview.prototype || typeof Preview.prototype.render !== 'function' || originalPreviewRender) return;
        originalPreviewRender = Preview.prototype.render;
        Preview.prototype.render = function () { if (mobileOptimizationEnabled) applyOptimizationToPreview(this); return originalPreviewRender.apply(this, arguments); };
    }

    function removeRenderHook() {
        try { if (originalPreviewRender && typeof Preview !== 'undefined' && Preview.prototype?.render) Preview.prototype.render = originalPreviewRender; }
        catch (error) { console.warn('[ICS] Render hook cleanup failed:', error); }
        originalPreviewRender = null;
    }

    function onCameraPositionUpdate(event) {
        if (!mobileOptimizationEnabled) return;
        const preview = event?.preview;
        if (preview) { applyOptimizationToPreview(preview); try { preview.render?.(); } catch (error) {} }
        else applyOptimizationToAllPreviews();
    }

    function installCameraListener() { if (!cameraListenerInstalled && typeof Blockbench?.on === 'function') { Blockbench.on('update_camera_position', onCameraPositionUpdate); cameraListenerInstalled = true; } }
    function removeCameraListener() { try { if (cameraListenerInstalled && typeof Blockbench?.removeListener === 'function') Blockbench.removeListener('update_camera_position', onCameraPositionUpdate); } catch (error) {} cameraListenerInstalled = false; }

    function setMobileOptimization(enabled) {
        mobileOptimizationEnabled = !!enabled;
        if (mobileOptimizationEnabled) { installRenderHook(); installCameraListener(); applyOptimizationToAllPreviews(); }
        else {
            removeCameraListener(); removeRenderHook();
            try { for (const [renderer, ratio] of originalPixelRatios) if (renderer?.setPixelRatio) renderer.setPixelRatio(ratio); } catch (error) {}
            originalPixelRatios.clear();
        }
        Blockbench.showQuickMessage('ICS Mobile Optimization: ' + (mobileOptimizationEnabled ? 'ON' : 'OFF'));
    }
    function toggleMobileOptimization() { setMobileOptimization(!mobileOptimizationEnabled); }

    // OUTLINE SETTINGS ----------------------------------------------------
    function loadOutlineSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(OUTLINE_SETTINGS_KEY) || 'null');
            if (!saved) return;
            const thickness = Number(saved.thickness);
            if (Number.isFinite(thickness)) outlineThickness = clamp(thickness, 0.01, 0.5);
            if (typeof saved.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) outlineColor = saved.color;
            if (typeof saved.type === 'string' && OUTLINE_STYLES[saved.type]) outlineType = saved.type;
        } catch (error) { console.warn('[ICS] Could not load outline settings:', error); }
    }
    function saveOutlineSettings() { try { localStorage.setItem(OUTLINE_SETTINGS_KEY, JSON.stringify({ type: outlineType, thickness: outlineThickness, color: outlineColor })); } catch (error) {} }
    function getCurrentOutlineStyle() { return OUTLINE_STYLES[outlineType] || OUTLINE_STYLES[DEFAULT_OUTLINE_TYPE]; }

    function getPencilTexture() {
        if (pencilTexture) return pencilTexture;
        if (typeof THREE === 'undefined' || typeof THREE.DataTexture !== 'function') return null;
        try {
            const size = 64, data = new Uint8Array(size * size * 4);
            const fract = value => value - Math.floor(value);
            const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const u = x / size, v = y / size, grain = hash(x, y), coarse = hash(Math.floor(x / 4), Math.floor(y / 4));
                const diagonal = Math.sin(u * 92 + v * 26 + coarse * 2.2), broken = Math.sin(u * 173 - v * 39 + grain * 6);
                const graphite = clamp(0.56 + diagonal * 0.22 + broken * 0.10 + (grain - 0.5) * 0.16, 0.08, 0.98);
                const alpha = clamp(0.50 + graphite * 0.50, 0, 1), index = (y * size + x) * 4, value = Math.round(255 * graphite);
                data[index] = data[index + 1] = data[index + 2] = value; data[index + 3] = Math.round(255 * alpha);
            }
            pencilTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
            pencilTexture.wrapS = THREE.RepeatWrapping; pencilTexture.wrapT = THREE.RepeatWrapping;
            pencilTexture.magFilter = THREE.LinearFilter; pencilTexture.minFilter = THREE.LinearFilter; pencilTexture.needsUpdate = true; pencilTexture.name = 'ICS Pencil Texture';
            return pencilTexture;
        } catch (error) { console.warn('[ICS] Could not create pencil texture:', error); return null; }
    }

    // Each disconnected island gets its own local expansion center. This
    // prevents a merged mesh with a gap from being stretched toward one
    // global center, while still letting all islands render as one feature.
    function buildComponentGeometry(source) {
        if (typeof THREE === 'undefined' || !source?.attributes?.position) return null;
        const geometry = source.clone();
        try {
            const position = source.attributes.position;
            const count = position.count;
            const parent = new Int32Array(count);
            const rank = new Uint8Array(count);
            for (let i = 0; i < count; i++) parent[i] = i;
            const find = a => { let root = a; while (parent[root] !== root) root = parent[root]; while (parent[a] !== a) { const next = parent[a]; parent[a] = root; a = next; } return root; };
            const union = (a, b) => { a = find(a); b = find(b); if (a === b) return; if (rank[a] < rank[b]) parent[a] = b; else { parent[b] = a; if (rank[a] === rank[b]) rank[a]++; } };
            const index = source.index;
            if (index?.array) {
                for (let i = 0; i + 2 < index.count; i += 3) { const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2); union(a, b); union(b, c); union(c, a); }
            } else {
                for (let i = 0; i + 2 < count; i += 3) { union(i, i + 1); union(i + 1, i + 2); union(i + 2, i); }
            }
            const min = new Map(), max = new Map(), p = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                p.fromBufferAttribute(position, i); const root = find(i); let lo = min.get(root), hi = max.get(root);
                if (!lo) { lo = p.clone(); hi = p.clone(); min.set(root, lo); max.set(root, hi); } else { lo.min(p); hi.max(p); }
            }
            const centers = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) { const root = find(i), lo = min.get(root), hi = max.get(root), c = lo.clone().add(hi).multiplyScalar(0.5); centers[i * 3] = c.x; centers[i * 3 + 1] = c.y; centers[i * 3 + 2] = c.z; }
            geometry.setAttribute('icsComponentCenter', new THREE.BufferAttribute(centers, 3));
            return geometry;
        } catch (error) { geometry.dispose?.(); console.warn('[ICS] Could not build component outline geometry:', error); return null; }
    }

    function getOutlineMaterial() {
        if (typeof THREE === 'undefined') return null;
        if (getOutlineMaterial.material) return getOutlineMaterial.material;
        try {
            const pencil = getPencilTexture();
            getOutlineMaterial.material = new THREE.ShaderMaterial({
                uniforms: {
                    icsOutlineThickness: { value: outlineThickness },
                    icsOutlineColor: { value: new THREE.Color(outlineColor) },
                    icsOutlineThicknessScale: { value: getCurrentOutlineStyle().thicknessScale },
                    icsOutlineOpacity: { value: getCurrentOutlineStyle().opacity },
                    icsOutlineMode: { value: getCurrentOutlineStyle().mode },
                    icsInkVariation: { value: getCurrentOutlineStyle().variation },
                    icsInkPerspective: { value: getCurrentOutlineStyle().perspective },
                    icsPerspectiveCamera: { value: 0 },
                    icsPencilTexture: { value: pencil }, icsPencilScale: { value: 2.8 }, icsPencilStrength: { value: 0.82 }
                },
                vertexShader: `
                    uniform float icsOutlineThickness;
                    uniform float icsOutlineThicknessScale;
                    uniform float icsOutlineMode;
                    uniform float icsInkVariation;
                    uniform float icsInkPerspective;
                    uniform float icsPerspectiveCamera;
                    attribute vec3 icsComponentCenter;
                    varying vec2 icsOutlineUv;
                    float inkNoise(vec3 p) { float a=sin(dot(p,vec3(1.73,4.91,2.37))); float b=sin(dot(p,vec3(5.13,1.29,3.77))+1.7); return a*.55+b*.45; }
                    float sketchNoise(vec3 p) { float a=sin(dot(p,vec3(.71,1.93,1.17))+.4); float b=sin(dot(p,vec3(1.41,.63,2.27))+2.1); float c=sin(dot(p,vec3(2.37,1.11,.53))+4.2); return a*.5+b*.3+c*.2; }
                    void main() {
                        icsOutlineUv=uv; vec3 expanded;
                        if (icsOutlineMode>.5) {
                            vec3 fromCenter=position-icsComponentCenter; float variation;
                            if (icsOutlineMode>1.5) { float broad=sketchNoise(position*.72); float fine=inkNoise(position*1.35); variation=max(.52,.82+broad*.30+fine*.08); }
                            else variation=1.0+inkNoise(position)*icsInkVariation;
                            vec4 viewPosition=modelViewMatrix*vec4(position,1.0); float depth=max(1.0,-viewPosition.z), perspectiveFactor=1.0;
                            if (icsPerspectiveCamera>.5) { perspectiveFactor=clamp(32.0/depth,.65,2.2); perspectiveFactor=mix(1.0,perspectiveFactor,icsInkPerspective); }
                            float scale=1.0+icsOutlineThickness*icsOutlineThicknessScale*variation*perspectiveFactor;
                            expanded=icsComponentCenter+fromCenter*scale;
                        } else expanded=position+normalize(normal)*icsOutlineThickness*icsOutlineThicknessScale;
                        gl_Position=projectionMatrix*modelViewMatrix*vec4(expanded,1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 icsOutlineColor; uniform float icsOutlineOpacity; uniform sampler2D icsPencilTexture; uniform float icsPencilScale; uniform float icsPencilStrength; varying vec2 icsOutlineUv;
                    void main() { float textureValue=1.0; if (icsPencilStrength>0.0) { vec4 pencil=texture2D(icsPencilTexture,icsOutlineUv*icsPencilScale); textureValue=mix(1.0,pencil.r,icsPencilStrength); } gl_FragColor=vec4(icsOutlineColor,icsOutlineOpacity*textureValue); }
                `,
                side: THREE.BackSide, transparent: true, depthTest: true, depthWrite: false, toneMapped: false
            });
            return getOutlineMaterial.material;
        } catch (error) { console.warn('[ICS] Could not create outline material:', error); return null; }
    }

    function updateOutlineMaterial() {
        const material = getOutlineMaterial.material; if (!material?.uniforms) return;
        const style = getCurrentOutlineStyle();
        material.uniforms.icsOutlineThickness.value = outlineThickness;
        material.uniforms.icsOutlineColor.value.set(outlineColor);
        material.uniforms.icsOutlineThicknessScale.value = style.thicknessScale;
        material.uniforms.icsOutlineOpacity.value = style.opacity;
        material.uniforms.icsOutlineMode.value = style.mode;
        material.uniforms.icsInkVariation.value = style.variation;
        material.uniforms.icsInkPerspective.value = style.perspective;
        material.uniforms.icsPencilStrength.value = style.texture ? 0.82 : 0;
        material.name = 'ICS ' + style.name + ' Outline Material'; material.needsUpdate = true;
    }

    function getOutlineStyleOptions() { const options={}; for (const [id,style] of Object.entries(OUTLINE_STYLES)) options[id]=style.name; return options; }

    function openOutlineSettings() {
        const dialog = new Dialog({ id:'ics_outline_settings', title:'ICS Outline Settings', form:{
            type:{label:'Outline Type',type:'select',options:getOutlineStyleOptions(),value:outlineType},
            thickness:{label:'Outline Size',type:'range',min:.01,max:.5,step:.01,value:outlineThickness},
            color:{label:'Outline Color',type:'color',value:outlineColor}
        }, onConfirm(form){
            if (typeof form.type==='string' && OUTLINE_STYLES[form.type]) outlineType=form.type;
            const thickness=Number(form.thickness), color=String(form.color||'');
            if (Number.isFinite(thickness)) outlineThickness=clamp(thickness,.01,.5);
            if (/^#[0-9a-f]{6}$/i.test(color)) outlineColor=color;
            updateOutlineMaterial(); saveOutlineSettings(); if (outlinesEnabled) applyOutlinesToAllElements();
            Blockbench.showQuickMessage('ICS '+getCurrentOutlineStyle().name+' Applied');
        }}); dialog.show();
    }

    function disposeOutlineObject(outline) {
        try { if (!outline) return; if (outline.parent) outline.parent.remove(outline); if (outline.geometry?.userData?.icsOutlineGeometry && outline.geometry.dispose) outline.geometry.dispose(); }
        catch (error) { console.warn('[ICS] Outline cleanup failed:', error); }
    }

    function createOutlineForMesh(mesh) {
        if (!mesh?.isMesh || !mesh.geometry || mesh.userData?.[OUTLINE_OBJECT_KEY]) return mesh?.userData?.[OUTLINE_OBJECT_KEY] || null;
        const material=getOutlineMaterial(); if (!material || typeof THREE==='undefined') return null;
        try {
            const outlineGeometry=buildComponentGeometry(mesh.geometry); if (!outlineGeometry) return null;
            outlineGeometry.userData=outlineGeometry.userData||{}; outlineGeometry.userData.icsOutlineGeometry=true;
            const outline=new THREE.Mesh(outlineGeometry,material); outline.name='ics_outline'; outline.userData={icsOutline:true}; outline.renderOrder=999; outline.frustumCulled=mesh.frustumCulled;
            outline.onBeforeRender=function(renderer,scene,camera){ const m=getOutlineMaterial.material; if (!m?.uniforms) return; m.uniforms.icsPerspectiveCamera.value=camera?.isPerspectiveCamera?1:0; };
            mesh.add(outline); mesh.userData=mesh.userData||{}; mesh.userData[OUTLINE_OBJECT_KEY]=outline; mesh.userData.icsOutlineSourceGeometry=mesh.geometry; return outline;
        } catch (error) { console.warn('[ICS] Could not create outline:', error); return null; }
    }

    function removeOutlineFromMesh(mesh) {
        if (!mesh?.userData) return; const outline=mesh.userData[OUTLINE_OBJECT_KEY]; if (!outline) return;
        disposeOutlineObject(outline); delete mesh.userData[OUTLINE_OBJECT_KEY]; delete mesh.userData.icsOutlineSourceGeometry;
    }

    function applyOutlineToObject(object) {
        if (!outlinesEnabled || !object?.traverse) return;
        object.traverse(child=>{
            if (!child || child.userData?.icsOutline) return;
            if (child.isMesh && child.geometry) {
                const existing=child.userData?.[OUTLINE_OBJECT_KEY];
                if (existing && child.userData.icsOutlineSourceGeometry !== child.geometry) removeOutlineFromMesh(child);
                if (!child.userData?.[OUTLINE_OBJECT_KEY]) createOutlineForMesh(child);
            }
        });
    }

    function applyOutlinesToAllElements() {
        if (!outlinesEnabled) return;
        try { updateOutlineMaterial(); const elements=typeof Outliner!=='undefined'&&Array.isArray(Outliner.elements)?Outliner.elements:[]; for (const element of elements) if (element?.mesh) applyOutlineToObject(element.mesh); }
        catch (error) { console.warn('[ICS] Outline update failed:', error); }
    }

    function removeAllOutlines() {
        try { const elements=typeof Outliner!=='undefined'&&Array.isArray(Outliner.elements)?Outliner.elements:[]; for (const element of elements) { const object=element?.mesh; if (object?.traverse) object.traverse(child=>removeOutlineFromMesh(child)); } }
        catch (error) { console.warn('[ICS] Outline removal failed:', error); }
    }
    function setOutlinesEnabled(enabled) { outlinesEnabled=!!enabled; if (outlinesEnabled) { applyOutlinesToAllElements(); Blockbench.showQuickMessage('ICS Outlines: ON'); } else { removeAllOutlines(); Blockbench.showQuickMessage('ICS Outlines: OFF'); } }
    function toggleOutlines() { setOutlinesEnabled(!outlinesEnabled); }
    function refreshOutlinesAfterSceneUpdate() { if (outlinesEnabled) applyOutlinesToAllElements(); }
    function installOutlineRefreshListener() { if (typeof Blockbench?.on==='function') Blockbench.on('update_camera_position',refreshOutlinesAfterSceneUpdate); }
    function removeOutlineRefreshListener() { try { if (typeof Blockbench?.removeListener==='function') Blockbench.removeListener('update_camera_position',refreshOutlinesAfterSceneUpdate); } catch (error) {} }

    function cleanupOutlines() {
        outlinesEnabled=false; removeOutlineRefreshListener(); removeAllOutlines();
        if (getOutlineMaterial.material?.dispose) getOutlineMaterial.material.dispose(); getOutlineMaterial.material=null;
        if (pencilTexture?.dispose) pencilTexture.dispose(); pencilTexture=null;
    }
    function buildHierarchy() { try { const menu=MenuBar?.menus?.tools; if (!menu) return; removeMenuHierarchy(); menu.structure.push({id:MENU_ID,name:'ICS',icon:'memory',children:actions.slice()}); menu.update?.(true); } catch (error) {} }
    function cleanup() { cleanupOutlines(); setMobileOptimization(false); removeCameraListener(); removeRenderHook(); originalPixelRatios.clear(); removeMenuHierarchy(); while(actions.length) safeDelete(actions.pop()); while(tools.length) safeDelete(tools.pop()); returnToMoveTool(); }

    Plugin.register(PLUGIN_ID, {
        title:'ICS — Immortal Cursed Spirit', author:'TFO', description:'Renderer-side visual tools for Blockbench.', about:'', version:VERSION, icon:'memory', variant:'both', min_version:'4.0.0',
        onload(){ loadOutlineSettings(); createFeature(MOBILE_OPTIMIZER_ID,'Mobile Optimization','speed',toggleMobileOptimization); createFeatureAction(MOBILE_OPTIMIZER_ACTION_ID,'Mobile Optimization','speed',toggleMobileOptimization); createFeatureAction(OUTLINE_ACTION_ID,'Outlines','border_all',toggleOutlines); createFeatureAction(OUTLINE_SETTINGS_ACTION_ID,'Outline Settings','settings',openOutlineSettings); installOutlineRefreshListener(); buildHierarchy(); Blockbench.showQuickMessage('ICS v'+VERSION+' loaded'); },
        oninstall(){}, onuninstall(){ cleanup(); }, onunload(){ cleanup(); }
    });
})();
