// ICS — Immortal Cursed Spirit
// DODFP experiment: 3D scene -> offscreen 2D texture -> texture on a 3D surface -> visible render.
// UI direction: dark, technical, restrained cursed-spirit creator aesthetic.

(function () {
	'use strict';

	const VERSION = '0.3.2';
	let installed = false;
	let surfaceEnabled = false;
	const states = new WeakMap();
	const TARGET_SIZE = 256;
	let surface;
	let probeTool;
	let creatorTool;

	function getPreviews() {
		return (typeof Preview !== 'undefined' && Array.isArray(Preview.all))
			? Preview.all
			: [];
	}

	function createSurface() {
		if (surface || typeof THREE === 'undefined' || !Canvas?.scene) return surface;

		const geometry = new THREE.PlaneGeometry(6, 6);
		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			depthWrite: false,
			depthTest: false,
			color: 0xffffff
		});
		surface = new THREE.Mesh(geometry, material);
		surface.name = 'ICS_DODFP_Surface';
		surface.visible = false;
		Canvas.scene.add(surface);
		return surface;
	}

	function removeSurface() {
		if (!surface) return;
		if (surface.parent) surface.parent.remove(surface);
		surface.geometry.dispose();
		surface.material.dispose();
		surface = undefined;
	}

	function updateSurface(preview, texture) {
		if (!surface || !surfaceEnabled) return;
		const material = surface.material;
		material.map = texture;
		material.needsUpdate = true;
		surface.visible = true;

		const camera = preview.camera;
		const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
		surface.position.copy(camera.position).add(direction.multiplyScalar(8));
		surface.quaternion.copy(camera.quaternion);
	}

	function installPreview(preview) {
		if (!preview || !preview.renderer || states.has(preview)) return false;

		const renderer = preview.renderer;
		if (typeof THREE === 'undefined' || !THREE.WebGLRenderTarget) {
			console.error('[ICS] Three.js WebGLRenderTarget is unavailable.');
			return false;
		}

		const target = new THREE.WebGLRenderTarget(TARGET_SIZE, TARGET_SIZE, {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBAFormat,
			depthBuffer: true,
			stencilBuffer: false
		});
		target.texture.name = 'ICS_DODFP_Offscreen';

		const originalRender = preview.render.bind(preview);
		const state = { target, originalRender, rendering: false };
		states.set(preview, state);

		preview.render = function () {
			if (state.rendering) return originalRender();
			state.rendering = true;

			try {
				const oldSurfaceVisible = surface ? surface.visible : false;
				if (surface) surface.visible = false;

				renderer.setRenderTarget(target);
				renderer.clear();
				renderer.render(Canvas.scene, preview.camera);
				renderer.setRenderTarget(null);

				if (surfaceEnabled) updateSurface(preview, target.texture);
				else if (surface) surface.visible = oldSurfaceVisible;

				originalRender();
			} catch (error) {
				console.error('[ICS] DODFP bridge failed:', error);
				try { renderer.setRenderTarget(null); } catch (_) {}
				originalRender();
			} finally {
				state.rendering = false;
			}
		};

		console.info('[ICS] DODFP bridge installed:', {
			version: VERSION,
			preview,
			renderer,
			renderTarget: target,
			texture: target.texture
		});
		return true;
	}

	function install() {
		createSurface();
		let count = 0;
		getPreviews().forEach(preview => {
			if (installPreview(preview)) count++;
		});
		installed = true;
		Blockbench.showQuickMessage('ICS v' + VERSION + ': DODFP probe connected (' + count + ' preview(s))');
	}

	function uninstall() {
		getPreviews().forEach(preview => {
			const state = states.get(preview);
			if (!state) return;
			preview.render = state.originalRender;
			state.target.dispose();
			states.delete(preview);
		});
		installed = false;
		surfaceEnabled = false;
		removeSurface();
	}

	function returnToMoveTool() {
		if (typeof BarItems !== 'undefined' && BarItems.move_tool && typeof BarItems.move_tool.select === 'function') {
			BarItems.move_tool.select();
		}
	}

	function openCreator() {
		new Dialog({
			id: 'ics_creator',
			title: 'ICS — Cursed Spirit Creator',
			width: 430,
			darken: true,
			form: {
				identity: {
					type: 'info',
					text: '**IMMORTAL CURSED SPIRIT**\n\nDODFP bridge v' + VERSION + ': Blockbench geometry is rendered to a 2D texture, then that texture is fed back onto a 3D surface.'
				},
				state: {
					type: 'info',
					text: `**Version:** ${VERSION}\n**Probe:** ${installed ? 'CONNECTED' : 'DORMANT'}\n**Surface:** ${surfaceEnabled ? 'VISIBLE' : 'HIDDEN'}`
				},
				enable: {
					type: 'checkbox',
					label: 'Enable DODFP probe',
					description: 'Creates the offscreen 2D render texture while preserving the normal Blockbench renderer.',
					value: installed
				},
				surface: {
					type: 'checkbox',
					label: 'Show 2D → 3D surface',
					description: 'Displays a real 3D plane carrying the offscreen texture in the preview camera.',
					value: surfaceEnabled
				},
				buffer: {
					type: 'info',
					text: `**2D buffer:** ${TARGET_SIZE} × ${TARGET_SIZE} RGBA · depth enabled\n**Return path:** texture → THREE.Mesh plane → render`
				},
				warning: {
					type: 'info',
					text: '*Experimental specimen. Small buffers and a simple surface are intentional for Android/mobile stability.*'
				}
			},
			buttons: ['Apply', 'Cancel'],
			onConfirm(form) {
				if (form.enable) {
					if (!installed) install();
					surfaceEnabled = !!form.surface;
					createSurface();
					if (surface) surface.visible = surfaceEnabled;
				} else if (installed) {
					uninstall();
				}
			}
		}).show();
	}

	// These are real Blockbench Tools, so they appear in the Toolbox rather than only in a menu.
	// main_tools is the normal modeling toolbox row used by Blockbench's built-in tools.
	probeTool = new Tool('ics_dodfp_probe', {
		name: 'ICS: DODFP Probe',
		icon: 'memory',
		category: 'tools',
		toolbar: 'main_tools',
		transformerMode: 'hidden',
		modes: ['edit', 'paint', 'display', 'animate', 'pose'],
		onSelect() {
			if (installed) {
				uninstall();
				Blockbench.showQuickMessage('ICS v' + VERSION + ' DODFP probe removed');
			} else {
				install();
			}
			returnToMoveTool();
		}
	});

	creatorTool = new Tool('ics_cursed_spirit_creator', {
		name: 'ICS: Cursed Spirit Creator',
		icon: 'auto_fix_high',
		category: 'tools',
		toolbar: 'main_tools',
		transformerMode: 'hidden',
		modes: ['edit', 'paint', 'display', 'animate', 'pose'],
		onSelect() {
			openCreator();
			returnToMoveTool();
		}
	});

	Plugin.register('ics', {
		title: 'ICS — Immortal Cursed Spirit',
		author: 'TFO',
		description: 'Experimental DODFP rendering bridge for Blockbench.',
		about: 'Experimental 3D → 2D → 3D rendering bridge using Blockbench\'s real WebGLRenderer and a Three.js texture surface.',
		version: VERSION,
		icon: 'memory',
		variant: 'both',
		min_version: '4.0.0',
		onload() {
			Blockbench.showQuickMessage('ICS v' + VERSION + ' imported successfully');
		},
		oninstall() {
			console.info('[ICS] Version ' + VERSION + ' imported successfully.');
		},
		onuninstall() {
			this.onunload();
		},
		onunload() {
			uninstall();
			if (probeTool && typeof probeTool.delete === 'function') probeTool.delete();
			if (creatorTool && typeof creatorTool.delete === 'function') creatorTool.delete();
		}
	});
})();
