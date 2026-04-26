import * as e from "pdfjs-dist";
import { Canvas as t, Circle as n, Ellipse as r, FabricImage as i, IText as a, Line as o, Path as s, PencilBrush as c, Polygon as l, Rect as u } from "fabric";
//#region src/utils/utils.ts
function d() {
	return typeof crypto < "u" && crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (e) => {
		let t = Math.random() * 16 | 0;
		return (e === "x" ? t : t & 3 | 8).toString(16);
	});
}
function f(e, t) {
	let n;
	return (...r) => {
		clearTimeout(n), n = setTimeout(() => e(...r), t);
	};
}
function p(e) {
	return new Date(e).toLocaleTimeString();
}
function m(e) {
	if (!e) return null;
	let t = e.toLowerCase();
	return t.includes("pdf") || t.endsWith(".pdf") ? "pdf" : t.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/) || t.startsWith("image/") ? "image" : null;
}
function h(e) {
	let t = new Date(e), n = (e, t = 2) => String(e).padStart(t, "0");
	return `D:${t.getFullYear()}${n(t.getMonth() + 1)}${n(t.getDate())}${n(t.getHours())}${n(t.getMinutes())}${n(t.getSeconds())}`;
}
function g(e) {
	if (!e) return Date.now();
	let t = e.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
	return t ? (/* @__PURE__ */ new Date(`${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}`)).getTime() : new Date(e).getTime() || Date.now();
}
//#endregion
//#region src/utils/xfdf.ts
var _ = "http://ns.adobe.com/xfdf/", v = "http://xfdf-annotator.example.com/ext/1.0";
function y(e) {
	return String(e ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function b(e) {
	return Math.round(e * 100) / 100;
}
function x(e, t) {
	return t - e;
}
function S(e, t, n, r, i) {
	let a = Math.min(e, n), o = Math.max(e, n), s = Math.min(t, r), c = Math.max(t, r);
	return `${b(a)},${b(x(c, i))},${b(o)},${b(x(s, i))}`;
}
function C(e, t, n) {
	return `${b(e)},${b(x(t, n))}`;
}
function w(e) {
	let t = new Date(e), n = (e, t = 2) => String(e).padStart(t, "0");
	return `D:${t.getFullYear()}${n(t.getMonth() + 1)}${n(t.getDate())}${n(t.getHours())}${n(t.getMinutes())}${n(t.getSeconds())}`;
}
function T(e) {
	if (!e) return Date.now();
	let t = e.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
	return t ? (/* @__PURE__ */ new Date(`${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}`)).getTime() : new Date(e).getTime() || Date.now();
}
function E(e, t) {
	let n = y(e.stroke ?? "#000000"), r = b(e.strokeWidth ?? 1), i = w(e.timestamp ?? Date.now()), a = ` page="${t}" name="${y(e.objectId ?? "")}" date="${i}" color="${n}" width="${r}"`;
	return e.opacity != null && e.opacity < 1 && (a += ` opacity="${b(e.opacity)}"`), a;
}
function D(e, t) {
	if (!e.path) return "";
	let n = [];
	for (let r of e.path) switch (r[0]) {
		case "M":
		case "L":
			n.push(C(r[1], r[2], t));
			break;
		case "Q":
			n.push(C(r[3], r[4], t));
			break;
		case "C":
			n.push(C(r[5], r[6], t));
			break;
	}
	return n.join(";");
}
function O(e) {
	let t = e.left ?? 0, n = e.top ?? 0, r = e.width ?? 0, i = e.height ?? 0;
	return {
		x1: t,
		y1: n,
		x2: t + r,
		y2: n + i
	};
}
function k(e, t, n) {
	let r = E(e, t);
	switch (e.tool) {
		case "freehand": {
			let t = D(e, n);
			if (!t) return "";
			let i = O(e);
			return `<ink${r} rect="${S(i.x1, i.y1, i.x2, i.y2, n)}"><gesture>${y(t)}</gesture></ink>`;
		}
		case "rectangle": {
			let t = e.left ?? 0, i = e.top ?? 0, a = e.width ?? 0, o = e.height ?? 0;
			return `<square${r} rect="${S(t, i, t + a, i + o, n)}"/>`;
		}
		case "circle": {
			let t = e.left ?? 0, i = e.top ?? 0;
			return `<circle${r} rect="${S(t, i, t + (e.rx ?? 0) * 2, i + (e.ry ?? 0) * 2, n)}"/>`;
		}
		case "line": {
			let t = (e.left ?? 0) + (e.x1 ?? 0), i = (e.top ?? 0) + (e.y1 ?? 0), a = (e.left ?? 0) + (e.x2 ?? 0), o = (e.top ?? 0) + (e.y2 ?? 0);
			return `<line${r} rect="${S(t, i, a, o, n)}" l1="${C(t, i, n)}" l2="${C(a, o, n)}"/>`;
		}
		case "arrow": {
			let t = O(e), i = D(e, n);
			return `<polyline${r} rect="${S(t.x1, t.y1, t.x2, t.y2, n)}" vertices="${y(i)}"><lineending>None;OpenArrow</lineending></polyline>`;
		}
		case "polygon": {
			if (!e.points?.length) return "";
			let t = e.left ?? 0, i = e.top ?? 0, a = e.points.map((e) => C(e.x + t, e.y + i, n)).join(";"), o = e.points.map((e) => e.x + t), s = e.points.map((e) => e.y + i);
			return `<polygon${r} rect="${S(Math.min(...o), Math.min(...s), Math.max(...o), Math.max(...s), n)}" vertices="${y(a)}"/>`;
		}
		case "text": {
			let t = e.fontSize ?? 14, i = (e.width ?? 100) + 20, a = (e.height ?? t * 1.4) + 10, o = e.left ?? 0, s = e.top ?? 0;
			return `<freetext${r} rect="${S(o, s, o + i, s + a, n)}"><contents>${y(e.text ?? "")}</contents><defaultappearance>/Helvetica ${t} Tf</defaultappearance></freetext>`;
		}
		default: return "";
	}
}
function A({ docId: e, pages: t, comments: n, log: r }) {
	let i = [];
	i.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"), i.push(`<xfdf xmlns="${_}" xmlns:ext="${v}" xml:space="preserve">`), i.push(`<f href="${y(e ?? "")}"/>`), i.push("<annots>");
	for (let { pageIndex: e, pageHPts: n, canvasJSON: r } of t) if (r?.objects) for (let t of r.objects) {
		let r = k(t, e, n);
		r && i.push(r);
	}
	i.push("</annots>"), i.push("<ext:canvas-data>");
	for (let { pageIndex: e, canvasJSON: n } of t) {
		if (!n) continue;
		let t = JSON.stringify(n);
		i.push(`<ext:page index="${e}"><![CDATA[${t}]]></ext:page>`);
	}
	if (i.push("</ext:canvas-data>"), n) {
		i.push(`<ext:comments counter="${n.counter ?? 0}">`);
		for (let e of n.comments ?? []) {
			i.push(`<ext:comment id="${y(e.id)}" page="${e.pageIndex}" baseX="${b(e.baseX)}" baseY="${b(e.baseY)}" number="${e.number}" resolved="${+!!e.resolved}">`);
			for (let t of e.messages) i.push(`<ext:message id="${y(t.id)}" userId="${y(t.userId)}" timestamp="${w(t.timestamp)}">${y(t.text)}</ext:message>`);
			i.push("</ext:comment>");
		}
		i.push("</ext:comments>");
	}
	return r?.length && i.push(`<ext:log><![CDATA[${JSON.stringify(r)}]]></ext:log>`), i.push("</xfdf>"), i.join("\n");
}
function j(e) {
	let t = new DOMParser().parseFromString(e, "application/xml"), n = t.querySelector("parsererror");
	if (n) throw Error("XFDF parse error: " + (n.textContent ?? "").slice(0, 200));
	let r = {
		pages: [],
		comments: null,
		log: []
	}, i = t.getElementsByTagNameNS(v, "canvas-data")[0];
	if (i) {
		let e = i.getElementsByTagNameNS(v, "page");
		for (let t of e) {
			let e = parseInt(t.getAttribute("index") ?? "0", 10);
			try {
				r.pages.push({
					pageIndex: e,
					canvasJSON: JSON.parse(t.textContent ?? "")
				});
			} catch {}
		}
	}
	let a = t.getElementsByTagNameNS(v, "comments")[0];
	if (a) {
		let e = parseInt(a.getAttribute("counter") ?? "0", 10), t = [];
		for (let e of a.getElementsByTagNameNS(v, "comment")) {
			let n = [];
			for (let t of e.getElementsByTagNameNS(v, "message")) n.push({
				id: t.getAttribute("id"),
				userId: t.getAttribute("userId"),
				text: t.textContent,
				timestamp: T(t.getAttribute("timestamp"))
			});
			t.push({
				id: e.getAttribute("id"),
				pageIndex: parseInt(e.getAttribute("page") ?? "0", 10),
				baseX: parseFloat(e.getAttribute("baseX") ?? "0"),
				baseY: parseFloat(e.getAttribute("baseY") ?? "0"),
				number: parseInt(e.getAttribute("number") ?? "0", 10),
				resolved: e.getAttribute("resolved") === "1",
				messages: n
			});
		}
		r.comments = {
			counter: e,
			comments: t
		};
	}
	let o = t.getElementsByTagNameNS(v, "log")[0];
	if (o) try {
		r.log = JSON.parse(o.textContent ?? "");
	} catch {}
	return r.pages.length === 0 && (r.pages = M(t)), r;
}
function M(e) {
	let t = e.getElementsByTagNameNS(_, "annots")[0];
	if (!t) return [];
	let n = Object.create(null);
	function r(e) {
		return n[e] || (n[e] = {
			version: "5.3.0",
			objects: []
		}), n[e];
	}
	function i(e) {
		return {
			stroke: e.getAttribute("color") ?? "#e74c3c",
			strokeWidth: parseFloat(e.getAttribute("width") ?? "2"),
			objectId: e.getAttribute("name") ?? "",
			timestamp: T(e.getAttribute("date"))
		};
	}
	function a(e) {
		if (!e) return null;
		let [t, n, r, i] = e.split(",").map(Number);
		return {
			left: t,
			bottom: n,
			right: r,
			top: i
		};
	}
	function o(e) {
		let t = e.top + 50;
		return {
			x: e.left,
			y: t - e.top,
			w: e.right - e.left,
			h: e.top - e.bottom,
			estH: t
		};
	}
	for (let e of t.children) {
		let t = e.localName, n = parseInt(e.getAttribute("page") ?? "0", 10), s = i(e), c = a(e.getAttribute("rect"));
		if (!c) continue;
		let l = o(c), u = r(n);
		switch (t) {
			case "square":
				u.objects.push({
					...s,
					tool: "rectangle",
					left: l.x,
					top: l.y,
					width: l.w,
					height: l.h
				});
				break;
			case "circle":
				u.objects.push({
					...s,
					tool: "circle",
					left: l.x,
					top: l.y,
					rx: l.w / 2,
					ry: l.h / 2
				});
				break;
			case "line": {
				let t = (e) => e ? e.split(",").map(Number) : null, n = t(e.getAttribute("l1")), r = t(e.getAttribute("l2"));
				n && r && u.objects.push({
					...s,
					tool: "line",
					x1: n[0],
					y1: l.estH - n[1],
					x2: r[0],
					y2: l.estH - r[1],
					left: 0,
					top: 0
				});
				break;
			}
			case "freetext": {
				let t = e.getElementsByTagNameNS(_, "contents")[0];
				u.objects.push({
					...s,
					tool: "text",
					left: l.x,
					top: l.y,
					text: t?.textContent ?? "",
					fontSize: 14
				});
				break;
			}
			case "ink": {
				let t = e.getElementsByTagNameNS(_, "gesture")[0];
				if (!t) break;
				let n = (t.textContent ?? "").split(";").map((e) => {
					let [t, n] = e.split(",").map(Number);
					return {
						x: t,
						y: l.estH - n
					};
				}).filter((e) => !isNaN(e.x));
				if (n.length < 2) break;
				u.objects.push({
					...s,
					tool: "freehand",
					left: 0,
					top: 0,
					path: n.map((e, t) => t === 0 ? [
						"M",
						e.x,
						e.y
					] : [
						"L",
						e.x,
						e.y
					])
				});
				break;
			}
			case "polygon": {
				let t = e.getAttribute("vertices");
				if (!t) break;
				let n = t.split(";").map((e) => {
					let [t, n] = e.split(",").map(Number);
					return {
						x: t,
						y: l.estH - n
					};
				}).filter((e) => !isNaN(e.x));
				n.length >= 3 && u.objects.push({
					...s,
					tool: "polygon",
					points: n,
					left: 0,
					top: 0
				});
				break;
			}
		}
	}
	return Object.entries(n).map(([e, t]) => ({
		pageIndex: parseInt(e, 10),
		canvasJSON: t
	}));
}
//#endregion
//#region src/core/PDFRenderer.ts
e.GlobalWorkerOptions.workerSrc || (e.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs");
var N = class {
	_pdf = null;
	_baseViewports = [];
	_pdfPages = [];
	_renderTasks = [];
	_pageCount = 0;
	get pageCount() {
		return this._pageCount;
	}
	async load(t) {
		let n = e.getDocument({
			url: t,
			cMapPacked: !0
		});
		return this._pdf = await n.promise, this._pageCount = this._pdf.numPages, this._pdfPages = await Promise.all(Array.from({ length: this._pageCount }, (e, t) => this._pdf.getPage(t + 1))), this._baseViewports = this._pdfPages.map((e) => e.getViewport({ scale: 1 })), this._pageCount;
	}
	async renderPage(e, t, n) {
		let r = n ?? 1, i = this._pdfPages[e];
		if (!i) return {
			width: 0,
			height: 0
		};
		let a = window.devicePixelRatio || 1, o = i.getViewport({ scale: r }), s = Math.round(o.width), c = Math.round(o.height);
		t.width = Math.round(s * a), t.height = Math.round(c * a), t.style.width = s + "px", t.style.height = c + "px";
		let l = t.getContext("2d");
		if (!l) return {
			width: s,
			height: c
		};
		l.setTransform(a, 0, 0, a, 0, 0), this._renderTasks[e]?.cancel();
		let u = i.render({
			canvasContext: l,
			canvas: t,
			viewport: o
		});
		this._renderTasks[e] = u;
		try {
			await u.promise;
		} catch (e) {
			if (e?.name !== "RenderingCancelledException") throw e;
		}
		return {
			width: s,
			height: c
		};
	}
	getScale(e, t = .92) {
		return this._baseViewports.length ? e * t / this._baseViewports[0].width : 1;
	}
	getBaseViewport(e) {
		return this._baseViewports[e] ?? {
			width: 612,
			height: 792
		};
	}
	getPdfDims(e) {
		let t = this._baseViewports[e];
		return t ? {
			widthPts: t.width,
			heightPts: t.height
		} : {
			widthPts: 612,
			heightPts: 792
		};
	}
	destroy() {
		this._renderTasks.forEach((e) => e?.cancel()), this._pdf &&= (this._pdf.destroy(), null), this._baseViewports = [], this._pdfPages = [], this._renderTasks = [], this._pageCount = 0;
	}
}, P = class {
	naturalWidth = 0;
	naturalHeight = 0;
	url = null;
	get pageCount() {
		return +!!this.url;
	}
	load(e) {
		return this.url = e, new Promise((t, n) => {
			let r = new Image();
			r.onload = () => {
				this.naturalWidth = r.naturalWidth, this.naturalHeight = r.naturalHeight, t({
					width: r.naturalWidth,
					height: r.naturalHeight
				});
			}, r.onerror = () => n(/* @__PURE__ */ Error("Failed to load image: " + e)), r.src = e;
		});
	}
	renderPage(e, t) {
		return Promise.resolve({
			width: this.naturalWidth,
			height: this.naturalHeight
		});
	}
	getScale(e, t = .92) {
		return this.naturalWidth ? e * t / this.naturalWidth : 1;
	}
	getBaseViewport() {
		return {
			width: this.naturalWidth,
			height: this.naturalHeight
		};
	}
	getPdfDims() {
		return {
			widthPts: this.naturalWidth,
			heightPts: this.naturalHeight
		};
	}
	destroy() {
		this.url = null, this.naturalWidth = 0, this.naturalHeight = 0;
	}
}, F = [
	"objectId",
	"createdBy",
	"timestamp",
	"actionType",
	"tool",
	"pageIndex"
], I = 4, L = 14, R = class {
	userId;
	onEvent;
	onCommentPlace;
	_pages;
	_dirtyPages;
	_jsonCache;
	currentTool = "select";
	strokeColor = "#e74c3c";
	strokeWidth = 3;
	mode = "edit";
	constructor({ userId: e, onEvent: t, onCommentPlace: n }) {
		this.userId = e, this.onEvent = t, this.onCommentPlace = n ?? (() => {}), this._pages = [], this._dirtyPages = /* @__PURE__ */ new Set(), this._jsonCache = /* @__PURE__ */ new Map();
	}
	createCanvas(e, n, r, i, a) {
		let o = new t(e, {
			width: Math.round(n * a),
			height: Math.round(r * a),
			selection: !0,
			preserveObjectStacking: !0
		});
		o.wrapperEl.style.cssText = "position:absolute;top:0;left:0;", o.setZoom(a);
		let s = {
			fc: o,
			baseW: n,
			baseH: r,
			poly: {
				active: !1,
				points: [],
				helpers: [],
				rubberband: null
			},
			draw: {
				active: !1,
				start: null,
				shape: null
			},
			erase: { active: !1 }
		};
		return this._pages[i] = s, this._setupEvents(s, i), this._applyToolTo(o), o;
	}
	resize(e, t) {
		let n = this._pages[e];
		n && (n.fc.setZoom(t), n.fc.setDimensions({
			width: Math.round(n.baseW * t),
			height: Math.round(n.baseH * t)
		}), n.fc.renderAll());
	}
	destroy() {
		this._pages.forEach((e) => {
			e && (e._keyHandler && document.removeEventListener("keydown", e._keyHandler), e.fc.dispose());
		}), this._pages = [], this._dirtyPages = /* @__PURE__ */ new Set(), this._jsonCache = /* @__PURE__ */ new Map();
	}
	setTool(e) {
		this.currentTool = e, this._pages.forEach((e) => {
			e && (this._cancelPolygon(e), this._applyToolTo(e.fc));
		});
	}
	setMode(e) {
		this.mode = e, this._pages.forEach((e) => {
			e && (this._cancelPolygon(e), this._applyModeTo(e.fc));
		});
	}
	setColor(e) {
		this.strokeColor = e, this._pages.forEach((t) => {
			t && t.fc.isDrawingMode && t.fc.freeDrawingBrush && (t.fc.freeDrawingBrush.color = e);
		});
	}
	setStrokeWidth(e) {
		this.strokeWidth = e, this._pages.forEach((t) => {
			t && t.fc.isDrawingMode && t.fc.freeDrawingBrush && (t.fc.freeDrawingBrush.width = e);
		});
	}
	insertImage(e, t) {
		let n = this._pages[t];
		if (n) if (typeof e == "string") this._placeImage(e, n, t);
		else {
			let r = new FileReader();
			r.onload = (e) => {
				this._placeImage(e.target?.result, n, t);
			}, r.onerror = () => console.error("Failed to read image file"), r.readAsDataURL(e);
		}
	}
	async _placeImage(e, t, n) {
		try {
			let r = await i.fromURL(e), a = t.baseW * .4;
			(r.width ?? 0) > a && r.scale(a / (r.width ?? 1)), r.set({
				left: (t.baseW - r.getScaledWidth()) / 2,
				top: (t.baseH - r.getScaledHeight()) / 2
			}), this._attachMeta(r, "image", n), r.selectable = this.mode === "edit" && this.currentTool === "select", r.evented = this.mode === "edit", t.fc.add(r), t.fc.setActiveObject(r), t.fc.renderAll();
			let o = r, s = {
				id: o.objectId ?? d(),
				description: `Inserted image on page ${n + 1}`,
				action: "added",
				tool: "image",
				userId: this.userId,
				timestamp: o.timestamp ?? Date.now(),
				pageIndex: n
			};
			o.objectId !== void 0 && (s.objectId = o.objectId), this.onEvent(s);
		} catch (e) {
			console.error("Failed to load image:", e);
		}
	}
	toJSON() {
		return this._pages.map((e, t) => {
			if (!e) return {
				pageIndex: t,
				canvasJSON: null
			};
			if (!this._dirtyPages.has(t) && this._jsonCache.has(t)) return {
				pageIndex: t,
				canvasJSON: this._jsonCache.get(t) ?? null
			};
			let n = e.fc.toObject(F);
			return this._jsonCache.set(t, n), this._dirtyPages.delete(t), {
				pageIndex: t,
				canvasJSON: n
			};
		});
	}
	async loadFromData(e) {
		this._dirtyPages.clear(), this._jsonCache.clear();
		let t = e.map(async ({ pageIndex: e, canvasJSON: t }) => {
			if (!t) return;
			let n = this._pages[e];
			if (!n) return;
			await n.fc.loadFromJSON(t, (e, t) => {
				t && F.forEach((n) => {
					e[n] !== void 0 && (t[n] = e[n]);
				});
			});
			let r = this.mode === "edit";
			n.fc.getObjects().forEach((e) => {
				e.selectable = r && this.currentTool === "select", e.evented = r;
			}), n.fc.renderAll(), this._jsonCache.set(e, t);
		});
		await Promise.all(t);
	}
	_applyToolTo(e) {
		if (this.mode === "view") {
			this._applyModeTo(e);
			return;
		}
		let t = this.currentTool, n = [
			"rectangle",
			"circle",
			"line",
			"arrow",
			"polygon"
		].includes(t);
		e.isDrawingMode = t === "freehand", e.selection = t === "select", t === "freehand" ? (e.freeDrawingBrush = new c(e), e.freeDrawingBrush.color = this.strokeColor, e.freeDrawingBrush.width = this.strokeWidth, e.defaultCursor = "crosshair", e.hoverCursor = "crosshair") : n || t === "text" || t === "comment" ? (e.defaultCursor = "crosshair", e.hoverCursor = "crosshair") : t === "eraser" ? (e.defaultCursor = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='2'%3E%3Cpath d='M20 20H7L3 16l10-10 7 7-3.5 3.5'/%3E%3Cpath d='M6 11l7 7'/%3E%3C/svg%3E\") 4 20, crosshair", e.hoverCursor = "crosshair") : (e.defaultCursor = "default", e.hoverCursor = "move"), e.getObjects().forEach((e) => {
			e._helper || (e.selectable = t === "select", e.evented = t === "select" || t === "eraser");
		}), e.renderAll();
	}
	_applyModeTo(e) {
		e.isDrawingMode = !1, e.selection = !1, e.getObjects().forEach((e) => {
			e._helper || (e.selectable = !1, e.evented = !1);
		}), e.renderAll();
	}
	_setupEvents(e, t) {
		let { fc: n, poly: r, draw: i, erase: a } = e;
		n.on("path:created", (e) => {
			let n = e.path;
			n && (this._attachMeta(n, "freehand", t), n.selectable = this.currentTool === "select", n.evented = !0, this._fireEvent("added", "freehand", n, t));
		}), n.on("mouse:down", (r) => {
			if (this.mode === "view") return;
			let o = r.scenePoint;
			switch (this.currentTool) {
				case "eraser":
					a.active = !0, this._eraseAt(n, r.e, t);
					break;
				case "rectangle":
				case "circle":
				case "line":
				case "arrow":
					i.active = !0, i.start = {
						x: o.x,
						y: o.y
					}, i.shape = this._makeShapePreview(this.currentTool, i.start), i.shape && n.add(i.shape);
					break;
				case "polygon":
					this._polygonClick(e, t, {
						x: o.x,
						y: o.y
					}, r.e);
					break;
				case "text":
					if (r.target?.type === "i-text") break;
					this._placeText(n, {
						x: o.x,
						y: o.y
					}, t);
					break;
				case "comment":
					if (r.target) break;
					this.onCommentPlace(t, o.x, o.y, r.e);
					break;
			}
		}), n.on("mouse:move", (e) => {
			if (this.mode === "view") return;
			if (this.currentTool === "eraser" && a.active) {
				this._eraseAt(n, e.e, t);
				return;
			}
			if (!i.active || !i.shape) {
				if (this.currentTool === "polygon" && r.active && r.rubberband) {
					let t = e.scenePoint;
					r.rubberband.set({
						x2: t.x,
						y2: t.y
					}), n.renderAll();
				}
				return;
			}
			let o = e.scenePoint;
			i.start && this._updateShapePreview(i.shape, this.currentTool, i.start, {
				x: o.x,
				y: o.y
			}), n.renderAll();
		}), n.on("mouse:up", (e) => {
			if (this.mode === "view" || (a.active = !1, !i.active)) return;
			i.active = !1;
			let r = e.scenePoint;
			i.shape &&= (n.remove(i.shape), null);
			let o = this.currentTool, s = i.start;
			if (i.start = null, ![
				"rectangle",
				"circle",
				"line",
				"arrow"
			].includes(o) || !s) return;
			let c = this._makeFinalShape(o, s, {
				x: r.x,
				y: r.y
			});
			!c || !this._isValidShape(c, o) || (this._attachMeta(c, o, t), c.selectable = o === "select", c.evented = !0, n.add(c), n.renderAll(), this._fireEvent("added", o, c, t));
		});
		let o = (i) => {
			i.key === "Escape" && this.currentTool === "polygon" && this._cancelPolygon(e), i.key === "Enter" && this.currentTool === "polygon" && r.points.length >= 3 && this._finalizePolygon(e, n, t);
		};
		document.addEventListener("keydown", o), e._keyHandler = o;
	}
	_eraseAt(e, t, n) {
		let r = e.findTarget(t)?.target;
		if (!r || r._helper) return;
		let i = {
			id: r.objectId ?? d(),
			description: `Erased on page ${n + 1}`,
			action: "removed",
			tool: r.tool ?? "eraser",
			userId: this.userId,
			timestamp: Date.now(),
			pageIndex: n
		};
		r.objectId !== void 0 && (i.objectId = r.objectId), e.discardActiveObject(), e.remove(r), e.renderAll(), this._markDirty(n), this.onEvent(i);
	}
	_makeShapePreview(e, t) {
		let n = {
			stroke: this.strokeColor,
			strokeWidth: this.strokeWidth,
			fill: "transparent",
			selectable: !1,
			evented: !1,
			strokeUniform: !0,
			_helper: !0
		};
		switch (e) {
			case "rectangle": return new u({
				...n,
				left: t.x,
				top: t.y,
				width: 0,
				height: 0
			});
			case "circle": return new r({
				...n,
				left: t.x,
				top: t.y,
				rx: 0,
				ry: 0,
				originX: "left",
				originY: "top"
			});
			case "line":
			case "arrow": return new o([
				t.x,
				t.y,
				t.x,
				t.y
			], {
				...n,
				fill: null
			});
			default: return null;
		}
	}
	_updateShapePreview(e, t, n, r) {
		t === "rectangle" ? e.set({
			left: Math.min(n.x, r.x),
			top: Math.min(n.y, r.y),
			width: Math.abs(r.x - n.x),
			height: Math.abs(r.y - n.y)
		}) : t === "circle" ? e.set({
			left: Math.min(n.x, r.x),
			top: Math.min(n.y, r.y),
			rx: Math.abs(r.x - n.x) / 2,
			ry: Math.abs(r.y - n.y) / 2
		}) : (t === "line" || t === "arrow") && e.set({
			x2: r.x,
			y2: r.y
		}), e.setCoords();
	}
	_makeFinalShape(e, t, n) {
		let i = {
			stroke: this.strokeColor,
			strokeWidth: this.strokeWidth,
			fill: "transparent",
			selectable: !1,
			evented: !1,
			strokeUniform: !0
		};
		switch (e) {
			case "rectangle": return new u({
				...i,
				left: Math.min(t.x, n.x),
				top: Math.min(t.y, n.y),
				width: Math.abs(n.x - t.x),
				height: Math.abs(n.y - t.y)
			});
			case "circle": return new r({
				...i,
				left: Math.min(t.x, n.x),
				top: Math.min(t.y, n.y),
				rx: Math.abs(n.x - t.x) / 2,
				ry: Math.abs(n.y - t.y) / 2,
				originX: "left",
				originY: "top"
			});
			case "line": return new o([
				t.x,
				t.y,
				n.x,
				n.y
			], {
				...i,
				fill: null,
				strokeLineCap: "round"
			});
			case "arrow": return this._makeArrow(t, n);
			default: return null;
		}
	}
	_makeArrow(e, t) {
		let n = t.x - e.x, r = t.y - e.y, i = Math.hypot(n, r);
		if (i < I) return null;
		let a = n / i, o = r / i, c = -o, l = a, u = Math.max(L, this.strokeWidth * 4), d = t.x - a * u * .7, f = t.y - o * u * .7, p = t.x - a * u, m = t.y - o * u, h = p + c * u * .4, g = m + l * u * .4, _ = p - c * u * .4, v = m - l * u * .4;
		return new s(`M ${e.x} ${e.y} L ${d} ${f} M ${h} ${g} L ${t.x} ${t.y} L ${_} ${v}`, {
			stroke: this.strokeColor,
			strokeWidth: this.strokeWidth,
			fill: "transparent",
			strokeLineCap: "round",
			strokeLineJoin: "round",
			strokeUniform: !0,
			selectable: !1,
			evented: !1
		});
	}
	_isValidShape(e, t) {
		if (!e) return !1;
		if (t === "rectangle") return (e.width ?? 0) > I || (e.height ?? 0) > I;
		if (t === "circle") {
			let t = e;
			return (t.rx ?? 0) > I || (t.ry ?? 0) > I;
		}
		if (t === "line") {
			let t = e, n = (t.x2 ?? 0) - (t.x1 ?? 0), r = (t.y2 ?? 0) - (t.y1 ?? 0);
			return Math.hypot(n, r) > I;
		}
		return !0;
	}
	_polygonClick(e, t, r, i) {
		let { fc: a, poly: s } = e, c = a.getZoom();
		if (s.active && s.points.length >= 3) {
			let n = s.points[0];
			if (Math.hypot(r.x - n.x, r.y - n.y) * c < 18) {
				this._finalizePolygon(e, a, t);
				return;
			}
		}
		s.active = !0, s.points.push({
			x: r.x,
			y: r.y
		});
		let l = 4 / c, u = new n({
			left: r.x - l,
			top: r.y - l,
			radius: l,
			fill: this.strokeColor,
			stroke: "#fff",
			strokeWidth: 1 / c,
			selectable: !1,
			evented: !1
		});
		if (u._helper = !0, a.add(u), s.helpers.push(u), s.points.length > 1) {
			let e = s.points[s.points.length - 2], t = new o([
				e.x,
				e.y,
				r.x,
				r.y
			], {
				stroke: this.strokeColor,
				strokeWidth: this.strokeWidth,
				selectable: !1,
				evented: !1,
				strokeLineCap: "round"
			});
			t._helper = !0, a.add(t), s.helpers.push(t);
		}
		s.rubberband ? s.rubberband.set({
			x1: r.x,
			y1: r.y,
			x2: r.x,
			y2: r.y
		}) : (s.rubberband = new o([
			r.x,
			r.y,
			r.x,
			r.y
		], {
			stroke: this.strokeColor,
			strokeWidth: this.strokeWidth,
			strokeDashArray: [6 / c, 4 / c],
			selectable: !1,
			evented: !1
		}), s.rubberband._helper = !0, a.add(s.rubberband)), a.renderAll(), s.points.length === 3 && this._hintPolygonClose(a, s.points[0], c, e);
	}
	_hintPolygonClose(e, t, r, i) {
		let a = 10 / r, o = new n({
			left: t.x - a,
			top: t.y - a,
			radius: a,
			fill: "transparent",
			stroke: this.strokeColor,
			strokeWidth: 1.5 / r,
			strokeDashArray: [3 / r, 3 / r],
			selectable: !1,
			evented: !1
		});
		o._helper = !0, e.add(o), i.poly.helpers.push(o), e.renderAll();
	}
	_finalizePolygon(e, t, n) {
		let { poly: r } = e;
		if (r.points.length < 3) {
			this._cancelPolygon(e);
			return;
		}
		r.helpers.forEach((e) => t.remove(e)), r.rubberband && t.remove(r.rubberband);
		let i = new l(r.points, {
			stroke: this.strokeColor,
			strokeWidth: this.strokeWidth,
			fill: "transparent",
			strokeUniform: !0,
			selectable: !1,
			evented: !1,
			objectCaching: !1,
			strokeLineJoin: "round"
		});
		this._attachMeta(i, "polygon", n), i.selectable = this.currentTool === "select", t.add(i), t.renderAll(), this._fireEvent("added", "polygon", i, n), r.active = !1, r.points = [], r.helpers = [], r.rubberband = null;
	}
	_cancelPolygon(e) {
		let { fc: t, poly: n } = e;
		n.helpers.forEach((e) => t.remove(e)), n.rubberband && t.remove(n.rubberband), n.active = !1, n.points = [], n.helpers = [], n.rubberband = null, t.renderAll();
	}
	_placeText(e, t, n) {
		let r = new a("", {
			left: t.x,
			top: t.y,
			fontFamily: "Inter, -apple-system, sans-serif",
			fontSize: 18,
			fill: this.strokeColor,
			selectable: !0,
			evented: !0,
			editable: !0,
			cursorColor: this.strokeColor,
			padding: 4
		});
		e.add(r), e.setActiveObject(r), r.enterEditing();
		let i = !1;
		r.on("editing:exited", () => {
			if (!i) {
				if (i = !0, !r.text || !r.text.trim()) {
					e.remove(r), e.renderAll();
					return;
				}
				this._attachMeta(r, "text", n), this._fireEvent("added", "text", r, n);
			}
		});
	}
	_attachMeta(e, t, n) {
		e.objectId = d(), e.createdBy = this.userId, e.timestamp = Date.now(), e.actionType = "draw", e.tool = t, e.pageIndex = n, this._dirtyPages.add(n);
	}
	_markDirty(e) {
		this._dirtyPages.add(e);
	}
	_fireEvent(e, t, n, r) {
		let i = {
			id: n.objectId ?? d(),
			description: `${e === "added" ? "Drew" : "Removed"} ${t} on page ${r + 1}`,
			action: e,
			tool: t,
			userId: this.userId,
			timestamp: n.timestamp ?? Date.now(),
			pageIndex: r
		};
		n.objectId !== void 0 && (i.objectId = n.objectId), this.onEvent(i);
	}
}, z = class {
	_container;
	_events = [];
	constructor(e) {
		this._container = document.getElementById(e);
	}
	addEvent(e) {
		this._events.push(e), this._removeEmptyPlaceholder(), this._prependEntry(e);
	}
	clear() {
		this._events = [], this._container && (this._container.innerHTML = "<div class=\"log-empty\">No activity yet</div>");
	}
	repopulate(e) {
		this.clear(), !(!e || e.length === 0) && (this._events = [...e], [...e].reverse().forEach((e) => this._prependEntry(e)));
	}
	getEvents() {
		return [...this._events];
	}
	_removeEmptyPlaceholder() {
		this._container?.querySelector(".log-empty")?.remove();
	}
	_prependEntry(e) {
		if (!this._container) return;
		let t = document.createElement("div");
		t.className = `log-entry action-${e.action}`, t.dataset.objectId = e.objectId ?? "";
		let n = e.userId ? e.userId.slice(0, 8) : "????????", r = e.pageIndex === void 0 ? "" : `Page ${e.pageIndex + 1}`, i = e.action === "added" ? "＋" : "−";
		t.innerHTML = `
      <div class="log-entry-header">
        <span class="log-badge ${e.action}">${i} ${e.action}</span>
        <span class="log-time">${p(e.timestamp)}</span>
      </div>
      <div class="log-detail">
        <span class="log-tool-name">${this._toolLabel(e.tool)}</span>
        <span class="log-page">${r}</span>
      </div>
      <div class="log-user" title="User ID: ${e.userId}">${n}…</div>
    `, this._container.prepend(t);
	}
	_toolLabel(e) {
		return {
			freehand: "Freehand",
			rectangle: "Rectangle",
			circle: "Ellipse",
			line: "Line",
			arrow: "Arrow",
			polygon: "Polygon",
			text: "Text",
			comment: "Comment",
			image: "Image",
			eraser: "Eraser"
		}[e] ?? e ?? "Object";
	}
}, B = class {
	userId;
	_pagesContainerId;
	_comments;
	_pinEls;
	_counter;
	_scale;
	_activeId;
	_pendingPlacement;
	_panel;
	_popup;
	constructor({ userId: e, pagesContainerId: t, threadPanelId: n, newPopupId: r }) {
		this.userId = e, this._pagesContainerId = t, this._comments = /* @__PURE__ */ new Map(), this._pinEls = /* @__PURE__ */ new Map(), this._counter = 0, this._scale = 1, this._activeId = null, this._pendingPlacement = null, this._panel = document.getElementById(n), this._popup = document.getElementById(r), this._bindPanelEvents(), this._bindPopupEvents();
	}
	startPlacement(e, t, n, r) {
		this._closeThreadSilent(), this._pendingPlacement = {
			pageIndex: e,
			baseX: t,
			baseY: n
		}, this._showPopup(r.clientX, r.clientY);
	}
	repositionAll(e) {
		this._scale = e, this._comments.forEach((e, t) => {
			let n = this._pinEls.get(t);
			n && this._positionPin(n, e);
		}), this._activeId && this._repositionOpenPanel();
	}
	setInteractive(e) {
		this._pinEls.forEach((t) => {
			t.style.pointerEvents = e ? "all" : "none";
		});
	}
	openThread(e) {
		let t = this._comments.get(e);
		t && (this._activeId = e, this._pinEls.forEach((t, n) => t.classList.toggle("active", n === e)), this._renderThread(t), this._panel && (this._panel.style.display = "flex"), this._repositionOpenPanel());
	}
	closeThread() {
		this._closeThreadSilent();
	}
	rebuildPins(e) {
		this._scale = e, this._pinEls.forEach((e) => e.remove()), this._pinEls.clear(), this._comments.forEach((e) => this._createPin(e));
	}
	clearAll() {
		this._pinEls.forEach((e) => e.remove()), this._pinEls.clear(), this._comments.clear(), this._counter = 0, this._activeId = null, this._closeThreadSilent(), this._hidePopup();
	}
	toJSON() {
		return {
			counter: this._counter,
			comments: Array.from(this._comments.values())
		};
	}
	fromJSON(e, t) {
		this.clearAll(), this._scale = t, this._counter = e.counter ?? 0, (e.comments ?? []).forEach((e) => {
			this._comments.set(e.id ?? "", e), this._createPin(e);
		});
	}
	_closeThreadSilent() {
		this._activeId = null, this._panel && (this._panel.style.display = "none"), this._pinEls.forEach((e) => e.classList.remove("active"));
	}
	_createPin(e) {
		let t = this._getPageLayersEl(e.pageIndex);
		if (!t) return;
		let n = document.createElement("div");
		n.className = "comment-pin", n.dataset.commentId = e.id ?? "", n.title = `#${e.number} — ${e.messages[0]?.text?.slice(0, 60) ?? ""}`, n.innerHTML = `
      <div class="comment-pin-badge">${e.number}</div>
      <div class="comment-pin-tip"></div>
    `, n.addEventListener("click", (t) => {
			t.stopPropagation(), this._activeId === e.id ? this._closeThreadSilent() : this.openThread(e.id ?? "");
		}), t.appendChild(n), this._pinEls.set(e.id ?? "", n), this._positionPin(n, e);
	}
	_positionPin(e, t) {
		e.style.left = Math.round(t.baseX * this._scale) + "px", e.style.top = Math.round(t.baseY * this._scale) + "px";
	}
	_getPageLayersEl(e) {
		return document.querySelector(`#${this._pagesContainerId} [data-page-index="${e}"] .page-layers`);
	}
	_renderThread(e) {
		if (!this._panel) return;
		let t = this._panel.querySelector(".ctp-pin-num"), n = this._panel.querySelector(".ctp-messages");
		t && (t.textContent = `#${e.number}`), n && (n.innerHTML = e.messages.map((e) => `
      <div class="ctp-message">
        <div class="ctp-msg-header">
          <span class="ctp-msg-user">${this._shortId(e.userId)}</span>
          <span class="ctp-msg-time">${p(e.timestamp)}</span>
        </div>
        <div class="ctp-msg-text">${this._safe(e.text ?? "")}</div>
      </div>
    `).join(""), n.scrollTop = n.scrollHeight);
	}
	_repositionOpenPanel() {
		if (!this._activeId) return;
		let e = this._comments.get(this._activeId);
		if (!e) return;
		let { x: t, y: n } = this._pinTipClientPos(e.pageIndex, e.baseX, e.baseY);
		this._panel && this._positionFloating(this._panel, t, n, 308, 400);
	}
	_pinTipClientPos(e, t, n) {
		let r = this._getPageLayersEl(e);
		if (!r) return {
			x: 0,
			y: 0
		};
		let i = r.getBoundingClientRect();
		return {
			x: i.left + Math.round(t * this._scale),
			y: i.top + Math.round(n * this._scale)
		};
	}
	_positionFloating(e, t, n, r, i) {
		let a = t + 13 + 10, o = n - i / 2 - 13;
		a + r > window.innerWidth - 12 && (a = t - 13 - 10 - r), o + i > window.innerHeight - 12 && (o = window.innerHeight - i - 12), o < 12 && (o = 12), a < 12 && (a = 12), e.style.left = Math.round(a) + "px", e.style.top = Math.round(o) + "px";
	}
	_bindPanelEvents() {
		if (!this._panel) return;
		this._panel.querySelector(".ctp-close")?.addEventListener("click", (e) => {
			e.stopPropagation(), this._closeThreadSilent();
		});
		let e = this._panel.querySelector(".ctp-reply-input"), t = this._panel.querySelector(".ctp-reply-btn"), n = () => {
			let t = e?.value?.trim();
			if (!t || !this._activeId) return;
			let n = this._comments.get(this._activeId);
			if (!n) return;
			n.messages.push({
				id: d(),
				userId: this.userId,
				text: t,
				timestamp: Date.now()
			}), e && (e.value = ""), this._renderThread(n);
			let r = this._pinEls.get(this._activeId);
			r && (r.title = `#${n.number} — ${n.messages[0]?.text?.slice(0, 60) ?? ""}`);
		};
		t?.addEventListener("click", (e) => {
			e.stopPropagation(), n();
		}), e?.addEventListener("keydown", (e) => {
			let t = e;
			t.key === "Enter" && !t.shiftKey && (t.preventDefault(), n());
		}), this._panel.addEventListener("click", (e) => e.stopPropagation());
	}
	_showPopup(e, t) {
		if (!this._popup) return;
		let n = e + 14, r = t - 140 / 2;
		n + 288 > window.innerWidth - 12 && (n = e - 288 - 14), r + 140 > window.innerHeight - 12 && (r = window.innerHeight - 140 - 12), r < 12 && (r = 12), n < 12 && (n = 12), this._popup.style.left = Math.round(n) + "px", this._popup.style.top = Math.round(r) + "px", this._popup.style.display = "flex";
		let i = this._popup.querySelector("textarea");
		i && (i.value = "", i.focus());
	}
	_hidePopup() {
		this._popup && (this._popup.style.display = "none"), this._pendingPlacement = null;
	}
	_bindPopupEvents() {
		if (!this._popup) return;
		let e = this._popup.querySelector("textarea"), t = this._popup.querySelector("#btn-post-comment"), n = this._popup.querySelector("#btn-cancel-comment"), r = () => {
			let t = e?.value?.trim();
			if (!t || !this._pendingPlacement) {
				this._hidePopup();
				return;
			}
			this._submitComment(t);
		};
		t?.addEventListener("click", (e) => {
			e.stopPropagation(), r();
		}), n?.addEventListener("click", (e) => {
			e.stopPropagation(), this._hidePopup();
		}), e?.addEventListener("keydown", (e) => {
			let t = e;
			t.key === "Enter" && !t.shiftKey && (t.preventDefault(), r()), t.key === "Escape" && this._hidePopup();
		}), this._popup.addEventListener("click", (e) => e.stopPropagation());
	}
	_submitComment(e) {
		if (!this._pendingPlacement) return;
		let { pageIndex: t, baseX: n, baseY: r } = this._pendingPlacement;
		this._counter++;
		let i = {
			id: d(),
			pageIndex: t,
			baseX: n,
			baseY: r,
			number: this._counter,
			resolved: !1,
			messages: [{
				id: d(),
				userId: this.userId,
				text: e,
				timestamp: Date.now()
			}]
		};
		this._comments.set(i.id ?? "", i), this._createPin(i), this._hidePopup(), this.openThread(i.id ?? "");
	}
	_shortId(e) {
		return e ? e.slice(0, 8) + "…" : "?";
	}
	_safe(e) {
		let t = document.createElement("div");
		return t.textContent = e, t.innerHTML;
	}
}, V = class {
	userId;
	_opts;
	_renderer = null;
	_docType = null;
	_docLabel = "";
	_baseDims = [];
	_currentScale = 1;
	_blobURL = null;
	_mode = "edit";
	_activePageIndex = 0;
	_log;
	_canvas;
	_comments;
	constructor(e = {}) {
		this._opts = {
			viewerPanelId: "viewer-panel",
			pagesContainerId: "pages-container",
			logContainerId: "log-entries",
			emptyStateId: "empty-state",
			loadingId: "loading-overlay",
			viewportId: "document-viewport",
			threadPanelId: "comment-thread-panel",
			newCommentPopupId: "new-comment-popup",
			displayScale: 1.5,
			userId: "",
			...e
		}, this.userId = this._opts.userId || d(), this._log = new z(this._opts.logContainerId), this._canvas = new R({
			userId: this.userId,
			onEvent: (e) => this._log.addEvent(e),
			onCommentPlace: (e, t, n, r) => {
				this._comments.startPlacement(e, t, n, r);
			}
		}), this._comments = new B({
			userId: this.userId,
			pagesContainerId: this._opts.pagesContainerId,
			threadPanelId: this._opts.threadPanelId,
			newPopupId: this._opts.newCommentPopupId
		}), this._bindResize();
	}
	async loadFile(e) {
		let t = m(e.name) ?? m(e.type);
		if (!t) throw Error(`Unsupported file: ${e.name}`);
		this._blobURL && URL.revokeObjectURL(this._blobURL), this._blobURL = URL.createObjectURL(e), await this._load(this._blobURL, t, e.name);
	}
	async loadURL(e, t, n = e) {
		await this._load(e, t, n);
	}
	setMode(e) {
		this._mode = e, this._canvas.setMode(e);
		let t = e === "view" || this._canvas.currentTool === "comment";
		this._comments.setInteractive(t);
		let n = document.getElementById("toolbar-panel");
		n && n.classList.toggle("view-mode", e === "view");
	}
	getMode() {
		return this._mode;
	}
	setTool(e) {
		this._mode !== "view" && (this._canvas.setTool(e), this._comments.setInteractive(e === "comment"));
	}
	setColor(e) {
		this._canvas.setColor(e);
	}
	setStrokeWidth(e) {
		this._canvas.setStrokeWidth(e);
	}
	clearLog() {
		this._log.clear();
	}
	insertImage(e) {
		this._mode !== "view" && this._canvas.insertImage(e, this._activePageIndex);
	}
	save() {
		let e = this._canvas.toJSON().map(({ pageIndex: e, canvasJSON: t }) => ({
			pageIndex: e,
			pageHPts: this._getPdfDims(e).heightPts,
			canvasJSON: t
		}));
		return A({
			docId: this._docLabel,
			pages: e,
			comments: this._comments.toJSON(),
			log: this._log.getEvents()
		});
	}
	async restore(e) {
		let t = j(e);
		await this._canvas.loadFromData(t.pages ?? []), this._log.repopulate(t.log ?? []), t.comments && this._comments.fromJSON(t.comments, this._currentScale);
	}
	destroy() {
		this._canvas.destroy(), this._renderer && this._renderer.destroy(), this._blobURL && URL.revokeObjectURL(this._blobURL), this._comments.clearAll();
	}
	async _load(e, t, n) {
		this._showLoading(!0);
		try {
			this._canvas.destroy(), this._renderer && this._renderer.destroy(), this._comments.clearAll(), this._baseDims = [], this._docType = t, this._docLabel = n;
			let r = this._viewerWidth();
			if (t === "pdf") {
				let t = new N();
				this._renderer = t;
				let n = await t.load(e);
				this._currentScale = t.getScale(r);
				for (let e = 0; e < n; e++) {
					let n = t.getBaseViewport(e);
					this._baseDims.push({
						width: n.width,
						height: n.height
					});
				}
			} else {
				let t = new P();
				this._renderer = t;
				let n = await t.load(e);
				this._currentScale = t.getScale(r), this._baseDims.push({
					width: n.width,
					height: n.height
				});
			}
			await this._buildDOM(n);
		} catch (e) {
			throw this._showLoading(!1), e;
		}
	}
	async _buildDOM(e) {
		let t = document.getElementById(this._opts.pagesContainerId);
		if (!t) return;
		t.innerHTML = "";
		let n = this._docType === "pdf" && this._baseDims.length > 1, r = this._currentScale, i = [], a = document.createDocumentFragment();
		for (let e = 0; e < this._baseDims.length; e++) {
			let { width: t, height: o } = this._baseDims[e], s = Math.round(t * r), c = Math.round(o * r), l = this._createPageWrapper(e, s, c, n);
			if (a.appendChild(l), this._docType === "pdf") {
				let t = l.querySelector(".pdf-layer");
				t && i.push({
					pageNum: e + 1,
					canvasEl: t
				});
			}
			let u = l.querySelector(".annotation-layer");
			u && this._canvas.createCanvas(u, t, o, e, r), l.querySelector(".page-layers")?.addEventListener("mousedown", () => {
				this._activePageIndex = e;
			}, !0);
		}
		t.appendChild(a), i.length > 0 && this._renderer instanceof N ? (await this._renderer.renderPage(i[0].pageNum - 1, i[0].canvasEl, r), this._showLoading(!1), this._showEmpty(!1), this._showViewport(!0), i.length > 1 && Promise.all(i.slice(1).map(({ pageNum: e, canvasEl: t }) => this._renderer.renderPage(e - 1, t, r))).catch(console.error)) : (this._showLoading(!1), this._showEmpty(!1), this._showViewport(!0)), this._canvas.setMode(this._mode), this._comments.repositionAll(r);
		let o = e.split(/[/\\]/).pop()?.replace(/\?.*$/, "") ?? e, s = document.getElementById("doc-title");
		s && (s.textContent = o);
		let c = document.getElementById("doc-meta");
		c && (c.textContent = this._docType === "pdf" ? `${this._baseDims.length} page${this._baseDims.length === 1 ? "" : "s"} · XFDF` : `${this._baseDims[0].width} × ${this._baseDims[0].height} px · XFDF`);
		let l = document.getElementById("btn-save");
		l && (l.disabled = !1);
	}
	_createPageWrapper(e, t, n, r) {
		let i = document.createElement("div");
		if (i.className = "page-wrapper", i.dataset.pageIndex = String(e), r) {
			let t = document.createElement("div");
			t.className = "page-number-label", t.textContent = `Page ${e + 1}`, i.appendChild(t);
		}
		let a = document.createElement("div");
		if (a.className = "page-layers", a.style.cssText = `width:${t}px;height:${n}px;overflow:visible;`, this._docType === "pdf") {
			let e = document.createElement("canvas");
			e.className = "pdf-layer", a.appendChild(e);
		} else {
			let e = this._renderer, r = document.createElement("img");
			r.className = "image-layer", r.src = e.url ?? "", r.style.cssText = `width:${t}px;height:${n}px;`, r.draggable = !1, a.appendChild(r);
		}
		let o = document.createElement("canvas");
		return o.className = "annotation-layer", a.appendChild(o), i.appendChild(a), i;
	}
	_getPdfDims(e) {
		if (this._renderer && typeof this._renderer.getPdfDims == "function") return this._renderer.getPdfDims(e);
		let t = this._baseDims[e] ?? {
			width: 612,
			height: 792
		};
		return {
			widthPts: t.width,
			heightPts: t.height
		};
	}
	_bindResize() {
		let e = document.getElementById(this._opts.viewerPanelId);
		if (!e || typeof ResizeObserver > "u") return;
		let t = f(async () => {
			if (!this._renderer || !this._baseDims.length) return;
			let e = this._viewerWidth(), t = this._renderer.getScale(e);
			if (Math.abs(t - this._currentScale) < .01) return;
			this._currentScale = t;
			let n = document.getElementById(this._opts.pagesContainerId);
			if (!n) return;
			let r = [];
			for (let e = 0; e < this._baseDims.length; e++) {
				let { width: i, height: a } = this._baseDims[e], o = Math.round(i * t), s = Math.round(a * t), c = n.querySelector(`[data-page-index="${e}"]`);
				if (!c) continue;
				let l = c.querySelector(".page-layers");
				if (l && (l.style.width = o + "px", l.style.height = s + "px"), this._docType === "pdf") {
					let t = c.querySelector(".pdf-layer");
					t && r.push({
						i: e,
						canvasEl: t
					});
				} else {
					let e = c.querySelector(".image-layer");
					e && (e.style.width = o + "px", e.style.height = s + "px");
				}
				this._canvas.resize(e, t);
			}
			r.length && this._renderer instanceof N && await Promise.all(r.map(({ i: e, canvasEl: n }) => this._renderer.renderPage(e, n, t))), this._comments.repositionAll(t);
		}, 250);
		new ResizeObserver(t).observe(e);
	}
	_viewerWidth() {
		let e = document.getElementById(this._opts.viewerPanelId);
		return e ? e.clientWidth : window.innerWidth;
	}
	_showEmpty(e) {
		let t = document.getElementById(this._opts.emptyStateId);
		t && (t.style.display = e ? "flex" : "none");
	}
	_showViewport(e) {
		let t = document.getElementById(this._opts.viewportId);
		t && (t.style.display = e ? "flex" : "none");
	}
	_showLoading(e) {
		let t = document.getElementById(this._opts.loadingId);
		t && (t.style.display = e ? "flex" : "none");
	}
};
//#endregion
export { z as ActivityLog, R as AnnotationCanvas, B as CommentManager, V as DocumentAnnotator, P as ImageRenderer, N as PDFRenderer, f as debounce, p as formatTime, g as fromPdfDate, j as fromXFDF, d as generateUUID, m as getDocumentType, h as toPdfDate, A as toXFDF };

//# sourceMappingURL=xfdf-annotator.js.map