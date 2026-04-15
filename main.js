import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

// ============================================================
// LOADING MANAGER — fix vấn đề 4: tránh màn hình xám lúc đầu
// ============================================================
let allTexturesLoaded = false;
const loadingScreen = document.createElement('div');
loadingScreen.style.cssText = `
	position:fixed;inset:0;background:#000;color:#7df;
	font-family:monospace;font-size:18px;
	display:flex;align-items:center;justify-content:center;
	z-index:9999;
`;
loadingScreen.textContent = 'Đang tải...';
document.body.appendChild(loadingScreen);

THREE.DefaultLoadingManager.onLoad = () => {
	allTexturesLoaded = true;
	loadingScreen.style.display = 'none';
};
THREE.DefaultLoadingManager.onError = (url) => {
	console.error('Lỗi khi tải tài nguyên:', url);
	loadingScreen.textContent = 'Lỗi tải: ' + url.split('/').pop();
};
THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => {
	loadingScreen.textContent = `Đang tải... ${loaded}/${total}`;
};

// ============================================================
// SCENE, CAMERA, RENDERER
// ============================================================

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraRig = new THREE.Group();
cameraRig.add(camera);
scene.add(cameraRig);
cameraRig.position.set(0, 50, 150);

const lookTarget = new THREE.Vector3(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.xr.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// VR Controllers
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
function makeLaser() {
	const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)];
	const geo = new THREE.BufferGeometry().setFromPoints(points);
	return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x88ccff }));
}
const laser1 = makeLaser(); laser1.scale.z = 10;
const laser2 = makeLaser(); laser2.scale.z = 10;
controller1.add(laser1);
controller2.add(laser2);
controller1.addEventListener('selectstart', onVRTrigger);
controller2.addEventListener('selectstart', onVRTrigger);
controller1.addEventListener('squeezestart', onVRGrip);
controller2.addEventListener('squeezestart', onVRGrip);
scene.add(controller1, controller2);

const loader = new THREE.TextureLoader();

// ============================================================
// TẠO THIÊN THỂ
// ============================================================

const earthMap = loader.load('earth_map.jpg');
earthMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

const earth = new THREE.Mesh(
	new THREE.SphereGeometry(2, 64, 64),
	new THREE.MeshStandardMaterial({
		map: earthMap,
		emissive: new THREE.Color(0xffffff),
		emissiveMap: loader.load('earth_night.jpg'),
		emissiveIntensity: 0.7
	})
);
const clouds = new THREE.Mesh(
	new THREE.SphereGeometry(2.02, 64, 64),
	new THREE.MeshStandardMaterial({ map: loader.load('clouds.jpg'), transparent: true, opacity: 0.4 })
);
const earthGroup = new THREE.Group();
earthGroup.add(earth);
earthGroup.add(clouds);

const moon = new THREE.Mesh(
	new THREE.SphereGeometry(0.5, 32, 32),
	new THREE.MeshStandardMaterial({ map: loader.load('moon.jpg') })
);
const moonPivot = new THREE.Object3D();
moonPivot.add(moon);
moon.position.x = 4;
earthGroup.add(moonPivot);

// earthPivot: quay quanh Mặt Trời
// earthGroup nằm trong earthPivot, offset x=35
const earthPivot = new THREE.Object3D();
earthPivot.add(earthGroup);
earthGroup.position.set(35, 0, 0);
scene.add(earthPivot);

const sun = new THREE.Mesh(
	new THREE.SphereGeometry(10, 64, 64),
	new THREE.MeshBasicMaterial({ map: loader.load('sun.jpg') })
);
scene.add(sun);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sunLight = new THREE.PointLight(0xffffff, 5, 1000);
sunLight.decay = 0;
scene.add(sunLight);

scene.add(new THREE.Mesh(
	new THREE.SphereGeometry(500, 64, 64),
	new THREE.MeshBasicMaterial({ map: loader.load('stars.jpg'), side: THREE.BackSide })
));

// Mỗi hành tinh gồm:
//   pivot  — Object3D quay quanh Mặt Trời (nằm trong scene)
//   group  — Group chứa mesh, offset x = orbitRadius (nằm trong pivot)
//   mesh   — Mesh hành tinh (nằm trong group)
// Lý do dùng group bọc mesh: để mesh.position luôn là (0,0,0) trong group,
// giúp getWorldPosition(mesh) trả về đúng vị trí hành tinh trên quỹ đạo.
function createPlanet(size, texturePath, orbitRadius) {
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(size, 64, 64),
		new THREE.MeshStandardMaterial({
			map: loader.load(texturePath),
			emissive: new THREE.Color(0xffffff),
			emissiveIntensity: 0.1
		})
	);
	const group = new THREE.Group();
	group.add(mesh);
	group.position.set(orbitRadius, 0, 0); // offset từ pivot

	const pivot = new THREE.Object3D();
	pivot.add(group);
	scene.add(pivot);

	return { mesh, group, pivot, orbitRadius };
}

const mercury = createPlanet(0.8, 'mercury.jpg', 15);
const venus = createPlanet(1.5, 'venus.jpg', 22);
const mars = createPlanet(1.2, 'mars.jpg', 45);
const jupiter = createPlanet(5, 'jupiter.jpg', 65);
const saturn = createPlanet(4, 'saturn.jpg', 85);
const uranus = createPlanet(3, 'uranus.jpg', 105);
const neptune = createPlanet(3, 'neptune.jpg', 125);

// Vành đai Sao Thổ — gắn vào mesh (không bị ảnh hưởng bởi group)
const ringMesh = new THREE.Mesh(
	new THREE.RingGeometry(5, 8, 64),
	new THREE.MeshBasicMaterial({ map: loader.load('saturn_ring.png'), side: THREE.DoubleSide, transparent: true })
);
ringMesh.rotation.x = Math.PI / 2;
saturn.mesh.add(ringMesh);

// ============================================================
// CẤU TRÚC DỮ LIỆU MỖI HÀNH TINH ĐỂ INSPECT
// mesh        — mesh cần raycasting
// orbitPivot  — Object3D quay quanh Mặt Trời (cần dừng + teleport)
// localGroup  — Group/Object3D chứa mesh bên trong pivot (cần reset position về 0 khi inspect)
// selfMesh    — mesh cần xoay trục (có thể khác mesh nếu là earthGroup)
// radius      — bán kính geometry để tính khoảng cách camera
// ============================================================
const PLANETS = [
	// index 0 — phím 1
	{
		name: 'Mặt Trời',
		mesh: sun,
		orbitPivot: null,   // Mặt Trời không quay quanh ai
		localGroup: null,
		selfObjects: [sun],
		radius: 10,
		isSun: true,
	},
	// index 1 — phím 2
	{
		name: 'Sao Thủy', mesh: mercury.mesh, orbitPivot: mercury.pivot, localGroup: mercury.group, selfObjects: [mercury.mesh], radius: 0.8,
	},
	// index 2 — phím 3
	{
		name: 'Sao Kim', mesh: venus.mesh, orbitPivot: venus.pivot, localGroup: venus.group, selfObjects: [venus.mesh], radius: 1.5,
	},
	// index 3 — phím 4
	{
		name: 'Trái Đất',
		mesh: earth,
		orbitPivot: earthPivot,
		localGroup: earthGroup,
		selfObjects: [earth, clouds],
		radius: 2,
	},
	// index 4 — phím 5
	{
		name: 'Sao Hỏa', mesh: mars.mesh, orbitPivot: mars.pivot, localGroup: mars.group, selfObjects: [mars.mesh], radius: 1.2,
	},
	// index 5 — phím 6
	{
		name: 'Sao Mộc', mesh: jupiter.mesh, orbitPivot: jupiter.pivot, localGroup: jupiter.group, selfObjects: [jupiter.mesh], radius: 5,
	},
	// index 6 — phím 7
	{
		name: 'Sao Thổ', mesh: saturn.mesh, orbitPivot: saturn.pivot, localGroup: saturn.group, selfObjects: [saturn.mesh], radius: 4,
	},
	// index 7 — phím 8
	{
		name: 'Sao Thiên Vương', mesh: uranus.mesh, orbitPivot: uranus.pivot, localGroup: uranus.group, selfObjects: [uranus.mesh], radius: 3,
	},
	// index 8 — phím 9
	{
		name: 'Sao Hải Vương', mesh: neptune.mesh, orbitPivot: neptune.pivot, localGroup: neptune.group, selfObjects: [neptune.mesh], radius: 3,
	},
	// index 9 — không có phím tắt riêng, vẫn xem được qua VR raycast
	{
		name: 'Mặt Trăng',
		mesh: moon,
		orbitPivot: earthPivot,
		localGroup: earthGroup,
		selfObjects: [moon],
		radius: 0.5,
	},
];

// ============================================================
// TRẠNG THÁI INSPECT
// ============================================================

let inspectMode = false;
let currentPlanetData = null;   // phần tử trong PLANETS đang inspect
let selfRotationPaused = false;
let spinVelocity = 0;

// Lưu lại vị trí gốc của localGroup để restore
let savedLocalPosition = new THREE.Vector3();
let savedPivotRotation = new THREE.Euler();

let isDragging = false;
let prevMouseX = 0, prevMouseY = 0;

// ============================================================
// UI
// ============================================================

// Hàm lấy tên quốc gia từ tọa độ
async function getCountryName(lat, lon) {
	const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=vi`;
	try {
		const response = await fetch(url);
		const data = await response.json();
		return data.countryName || "Biển cả hoặc vùng không xác định";
	} catch (error) {
		return "Lỗi kết nối API";
	}
}

const hud = document.createElement('div');
hud.style.cssText = `
	position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
	background:rgba(0,0,0,0.6);color:#ccc;font-family:monospace;font-size:13px;
	padding:10px 18px;border-radius:8px;pointer-events:none;text-align:center;
	border:1px solid rgba(255,255,255,0.15);
`;
hud.innerHTML = `
	<b>1</b>:Mặt Trời <b>2</b>:Sao Thủy <b>3</b>:Sao Kim <b>4</b>: <b>5</b>:Sao Hỏa <b>6</b>:Sao Mộc <br>
	<b>7</b>:Sao Thổ <b>8</b>:Sao Thiên Vương <b>9</b>:Sao Hải Vương <b>0</b>:Toàn Cảnh <br>
`;
document.body.appendChild(hud);

const statusEl = document.createElement('div');
statusEl.style.cssText = `
	position:fixed;top:20px;left:50%;transform:translateX(-50%);
	background:rgba(0,0,0,0.55);color:#7df;font-family:monospace;font-size:14px;
	padding:8px 18px;border-radius:6px;pointer-events:none;opacity:0;transition:opacity 0.3s;
`;
document.body.appendChild(statusEl);

const countryInfo = document.createElement('div');
countryInfo.style.cssText = `
    position:fixed;top:70px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.8);color:#fff;font-family:monospace;font-size:16px;
    padding:15px 25px;border-radius:10px;pointer-events:none;
    border:2px solid #7df;display:none;z-index:100;text-align:center;
`;
document.body.appendChild(countryInfo);

function showCountryInfo(text) {
	countryInfo.innerHTML = text;
	countryInfo.style.display = 'block';
	// Tự ẩn sau 5 giây
	setTimeout(() => { countryInfo.style.display = 'none'; }, 5000);
}
let _st;
function showStatus(msg, ms = 2500) {
	statusEl.textContent = msg;
	statusEl.style.opacity = '1';
	clearTimeout(_st);
	_st = setTimeout(() => { statusEl.style.opacity = '0'; }, ms);
}

// ============================================================
// CAMERA HELPERS
// ============================================================

function zoomRig(factor) {
	const offset = new THREE.Vector3().subVectors(cameraRig.position, lookTarget);
	const dist = THREE.MathUtils.clamp(offset.length() * factor, 4, 500);
	cameraRig.position.copy(lookTarget).add(offset.normalize().multiplyScalar(dist));
}

function rotateRigAroundTarget(angleY) {
	const offset = new THREE.Vector3().subVectors(cameraRig.position, lookTarget);
	offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
	cameraRig.position.copy(lookTarget).add(offset);
}
// Thêm hàm này cạnh rotateRigAroundTarget
function rotateRigAroundTargetVertical(angleX) {
	const offset = new THREE.Vector3().subVectors(cameraRig.position, lookTarget);
	// Trục xoay là trục ngang vuông góc với offset và trục Y
	const right = new THREE.Vector3().crossVectors(
		new THREE.Vector3(0, 1, 0), offset
	).normalize();
	offset.applyAxisAngle(right, angleX);
	// Giới hạn góc để không lộn ngược
	const newPos = new THREE.Vector3().copy(lookTarget).add(offset);
	const dist = offset.length();
	const elevAngle = Math.asin(offset.y / dist);
	if (Math.abs(elevAngle) < Math.PI / 2 - 0.05) {
		cameraRig.position.copy(newPos);
	}
}

function updateCameraLook() {
	camera.lookAt(lookTarget);
}

// ============================================================
// ENTER / EXIT INSPECT
// ============================================================

function enterInspectMode(planetData) {
	if (inspectMode) exitInspectMode();

	const { orbitPivot, localGroup, radius, name, isSun } = planetData;

	// 1. Ẩn TẤT CẢ các hành tinh khác và Mặt Trời
	// Duyệt qua danh sách để ẩn mesh và group
	PLANETS.forEach(p => {
		if (p.mesh) p.mesh.visible = false;
		// Nếu là Trái Đất, ẩn cả mây
		if (p.name.includes("Trái Đất")) clouds.visible = false;
	});
	sun.visible = false;

	// Tính offset chiều cao mắt VR — dùng chung cho cả hai nhánh
	// eyeY bù lại chiều cao headset để hành tinh nằm đúng trung tâm tầm nhìn
	const eyeY = renderer.xr.isPresenting ? 1.6 : 0;

	// 2. Chỉ hiện lại hành tinh đang chọn
	if (isSun) {
		sun.visible = true;
		lookTarget.set(0, 0, 0);
		const viewDist = Math.max(radius * 3, 15);
		cameraRig.position.set(0, -eyeY, viewDist);
	} else {
		// Hiện mesh hành tinh đang soi
		planetData.mesh.visible = true;
		// Nếu soi Trái Đất thì hiện lại mây
		if (name.includes("Trái Đất")) clouds.visible = true;

		savedLocalPosition.copy(localGroup.position);
		savedPivotRotation.copy(orbitPivot.rotation);

		orbitPivot.rotation.set(0, 0, 0);
		localGroup.position.set(0, 0, 0);

		// Dời đèn ra sau lưng camera để soi sáng mặt trước hành tinh
		sunLight.position.set(0, 10, 20);

		lookTarget.set(0, 0, 0);
		const viewDist = Math.max(radius * 5, 4);
		cameraRig.position.set(0, -eyeY, viewDist);
	}

	inspectMode = true;
	currentPlanetData = planetData;
	selfRotationPaused = false;
	updateStopBtn();
	showStatus(` ${name}`);
}

function exitInspectMode() {
	if (!currentPlanetData) return;

	const { orbitPivot, localGroup, isSun } = currentPlanetData;

	// 1. Hiện lại tất cả mọi thứ
	PLANETS.forEach(p => {
		if (p.mesh) p.mesh.visible = true;
	});
	sun.visible = true;
	clouds.visible = true;

	// 2. Trả lại vị trí
	if (!isSun) {
		localGroup.position.copy(savedLocalPosition);
		orbitPivot.rotation.copy(savedPivotRotation);
	}

	inspectMode = false;
	currentPlanetData = null;
	lookTarget.set(0, 0, 0);

	// Bù chiều cao mắt VR khi quay về toàn cảnh
	const eyeY = renderer.xr.isPresenting ? 1.6 : 0;
	cameraRig.position.set(0, 50 - eyeY, 150);

	showStatus('Toàn cảnh');
	sunLight.position.set(0, 0, 0);
	updateStopBtn();
}


// ============================================================
// ANIMATE
// ============================================================

const DEADZONE = 0.15;

// Tốc độ quỹ đạo mỗi hành tinh (rad/frame)
const ORBIT_SPEEDS = new Map([
	[earthPivot, 0.0005],
	[mercury.pivot, 0.0047],
	[venus.pivot, 0.0018],
	[mars.pivot, 0.0025],
	[jupiter.pivot, 0.0013],
	[saturn.pivot, 0.0009],
	[uranus.pivot, 0.0006],
	[neptune.pivot, 0.0004],
]);

function animate() {
	// Fix vấn đề 4: không render cho đến khi tất cả texture đã load
	if (!allTexturesLoaded) return;
	// Quỹ đạo: bỏ qua pivot của hành tinh đang inspect (đang bị "đóng băng" tại gốc)
	const frozenPivot = currentPlanetData?.orbitPivot ?? null;
	for (const [pivot, speed] of ORBIT_SPEEDS) {
		if (pivot !== frozenPivot) pivot.rotation.y += speed;
	}
	moonPivot.rotation.y += 0.002;

	// Tự xoay trục
	if (!selfRotationPaused) {
		earth.rotation.y += 0.002;
		clouds.rotation.y += 0.001;
		sun.rotation.y += 0.0005;
		mercury.mesh.rotation.y += 0.002;
		venus.mesh.rotation.y += 0.0015;
		mars.mesh.rotation.y += 0.0008;
		jupiter.mesh.rotation.y += 0.0005;
		saturn.mesh.rotation.y += 0.0003;
		uranus.mesh.rotation.y += 0.0002;
		neptune.mesh.rotation.y += 0.0001;
	} else if (currentPlanetData && Math.abs(spinVelocity) > 0.00005) {
		// Quán tính sau khi thả chuột
		for (const obj of currentPlanetData.selfObjects) obj.rotation.y += spinVelocity;
		spinVelocity *= 0.90;
	}

	// Gamepad VR
	const session = renderer.xr.getSession();
	if (session) {
		for (const source of session.inputSources) {
			if (!source.gamepad) continue;
			const axisH = source.gamepad.axes[2] ?? 0;
			const axisV = source.gamepad.axes[3] ?? 0;

			if (inspectMode && selfRotationPaused && Math.abs(axisH) > DEADZONE) {
				for (const obj of currentPlanetData.selfObjects) obj.rotation.y -= axisH * 0.03;
				spinVelocity = -axisH * 0.03;
			} else if (Math.abs(axisH) > DEADZONE) {
				rotateRigAroundTarget(-axisH * 0.03);
			}
			if (Math.abs(axisV) > DEADZONE) zoomRig(axisV > 0 ? 1.03 : 0.97);
		}
	}

	updateCameraLook();

	renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// ============================================================
// PHÍM BẤM
// ============================================================

window.addEventListener('keydown', (e) => {
	switch (e.key) {
		case '0': exitInspectMode(); break;
		case '1': enterInspectMode(PLANETS[0]); break; // Mặt Trời
		case '2': enterInspectMode(PLANETS[1]); break; // Sao Thủy
		case '3': enterInspectMode(PLANETS[2]); break; // Sao Kim
		case '4': enterInspectMode(PLANETS[3]); break; // Trái Đất
		case '5': enterInspectMode(PLANETS[4]); break; // Sao Hỏa
		case '6': enterInspectMode(PLANETS[5]); break; // Sao Mộc
		case '7': enterInspectMode(PLANETS[6]); break; // Sao Thổ
		case '8': enterInspectMode(PLANETS[7]); break; // Sao Thiên Vương
		case '9': enterInspectMode(PLANETS[8]); break; // Sao Hải Vương
		case ' ':
			if (inspectMode) {
				selfRotationPaused = !selfRotationPaused;
				spinVelocity = 0;
				showStatus(selfRotationPaused
					? '⏸ Đã dừng — kéo chuột để xoay thủ công'
					: '▶ Tiếp tục tự xoay');
			}
			e.preventDefault();
			break;
	}
});

// ============================================================
// CHUỘT
// ============================================================

window.addEventListener('wheel', (e) => { zoomRig(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: true });

window.addEventListener('mousedown', (e) => {
	isDragging = true; prevMouseX = e.clientX; prevMouseY = e.clientY; spinVelocity = 0;
});
window.addEventListener('mouseup', () => { isDragging = false; });
window.addEventListener('mousemove', (e) => {
	if (!isDragging) return;
	const dx = e.clientX - prevMouseX;
	const dy = e.clientY - prevMouseY;

	if (inspectMode && selfRotationPaused && currentPlanetData) {
		const rotY = -dx * 0.008;
		const rotX = -dy * 0.008;
		for (const obj of currentPlanetData.selfObjects) {
			obj.rotation.y += rotY;
			obj.rotation.x = THREE.MathUtils.clamp(obj.rotation.x + rotX, -Math.PI / 2, Math.PI / 2);
		}
		spinVelocity = rotY;
	} else {
		rotateRigAroundTarget(-dx * 0.005);
		rotateRigAroundTargetVertical(dy * 0.005);
	}

	prevMouseX = e.clientX;
	prevMouseY = e.clientY;
});

// ============================================================
// VR MENU (hiện bằng nút grip/squeeze)
// Fix vấn đề 2: gắn menu vào camera để kích thước cố định, xóa nhãn "Chọn Hành Tinh"
// ============================================================

let vrMenuVisible = false;
// Dùng cameraGroup riêng để gắn menu — menu sẽ luôn cùng kích thước với camera
const vrMenuGroup = new THREE.Group();
camera.add(vrMenuGroup); // Gắn trực tiếp vào camera để ghim màn hình

function makeTextSprite(text, options = {}) {
	const {
		fontSize = 56, bgColor = 'rgba(10,20,40,0.92)',
		textColor = '#ffffff', borderColor = '#7df',
		width = 1024, height = 120, // Tăng resolution để hết mờ
	} = options;
	const canvas = document.createElement('canvas');
	canvas.width = width; canvas.height = height;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = bgColor;
	ctx.beginPath();
	ctx.roundRect(2, 2, width - 4, height - 4, 14);
	ctx.fill();
	ctx.strokeStyle = borderColor;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.roundRect(2, 2, width - 4, height - 4, 14);
	ctx.stroke();
	ctx.fillStyle = textColor;
	ctx.font = `bold ${fontSize}px Arial`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, width / 2, height / 2);
	const tex = new THREE.CanvasTexture(canvas);
	const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
	const sprite = new THREE.Sprite(mat);
	sprite.scale.set(width / height * 0.35, 0.35, 1);
	return sprite;
}

const MENU_ITEMS = [
	{ label: 'Mặt Trời',        action: () => enterInspectMode(PLANETS[0]) },
	{ label: 'Sao Thủy',        action: () => enterInspectMode(PLANETS[1]) },
	{ label: 'Sao Kim',         action: () => enterInspectMode(PLANETS[2]) },
	{ label: 'Trái Đất',        action: () => enterInspectMode(PLANETS[3]) },
	{ label: 'Sao Hỏa',         action: () => enterInspectMode(PLANETS[4]) },
	{ label: 'Sao Mộc',         action: () => enterInspectMode(PLANETS[5]) },
	{ label: 'Sao Thổ',         action: () => enterInspectMode(PLANETS[6]) },
	{ label: 'Sao Thiên Vương', action: () => enterInspectMode(PLANETS[7]) },
	{ label: 'Sao Hải Vương',   action: () => enterInspectMode(PLANETS[8]) },
	{ label: 'Mặt Trăng',       action: () => enterInspectMode(PLANETS[9]) },
	{ label: 'Toàn Cảnh',       action: () => exitInspectMode() },
];

// Thông số để đạt chiều cao 2/3 màn hình và ghim bên phải
const MENU_ITEM_SCALE_X = 0.6;
const MENU_ITEM_SCALE_Y = 0.08;
const MENU_ROW_GAP = 0.065; 

const menuSprites = MENU_ITEMS.map((item, i) => {
	const sprite = makeTextSprite(item.label, { fontSize: 64 });
	const row = MENU_ITEMS.length - 1 - i;
	sprite.position.set(0, row * MENU_ROW_GAP - (MENU_ITEMS.length * MENU_ROW_GAP) / 2 + MENU_ROW_GAP / 2, 0);
	sprite.scale.set(MENU_ITEM_SCALE_X, MENU_ITEM_SCALE_Y, 1);
	sprite.userData.menuIndex = i;
	vrMenuGroup.add(sprite);
	return sprite;
});

// Vị trí menu: X=1.0 (dịch sang phải nhiều hơn), Y=0, Z=-1.2 (trước mặt)
vrMenuGroup.position.set(1.0, 0, -1.2);
vrMenuGroup.visible = false;

// Khoảng cách menu cố định trước mặt camera (đơn vị world space)
const MENU_DIST = 1.2; // 1.2 đơn vị trước mặt

function showVRMenu() {
	vrMenuGroup.visible = true;
	vrMenuVisible = true;
}

function hideVRMenu() {
	vrMenuGroup.visible = false;
	vrMenuVisible = false;
}

function onVRGrip() {
	if (vrMenuVisible) hideVRMenu();
	else showVRMenu();
}

// ============================================================
// NUT STOP/PLAY trong inspect mode
// Fix vấn đề 1: kích thước nút KHÔNG thay đổi theo hành tinh
// ============================================================

// Cấu hình nút Dừng xoay to rõ, ghim giữa-dưới
const STOPBTN_SCALE_X = 0.7;
const STOPBTN_SCALE_Y = 0.12;

let stopBtnSprite = makeTextSprite('Dừng xoay', {
	fontSize: 70, 
	bgColor: 'rgba(40,10,10,0.9)', borderColor: '#cc4444',
});
// Ghim vị trí giữa (X=0), thấp hơn nữa (Y=-0.8), trước mặt (Z=-1.1)
stopBtnSprite.position.set(0, -0.8, -1.1);
stopBtnSprite.scale.set(STOPBTN_SCALE_X, STOPBTN_SCALE_Y, 1);
stopBtnSprite.visible = false;
camera.add(stopBtnSprite); // Gắn vào camera

function updateStopBtn() {
	const shouldShow = inspectMode && renderer.xr.isPresenting;
	stopBtnSprite.visible = shouldShow;
	if (!shouldShow) return;

	const label = selfRotationPaused ? 'Tiếp tục xoay' : 'Dừng xoay';
	const bgCol = selfRotationPaused ? 'rgba(10,40,10,0.9)' : 'rgba(40,10,10,0.9)';
	const bdCol = selfRotationPaused ? '#44cc44' : '#cc4444';
	const tmp = makeTextSprite(label, { fontSize: 70, bgColor: bgCol, borderColor: bdCol });
	stopBtnSprite.scale.set(STOPBTN_SCALE_X, STOPBTN_SCALE_Y, 1);
	stopBtnSprite.material.map.dispose();
	stopBtnSprite.material.map = tmp.material.map;
	stopBtnSprite.material.needsUpdate = true;
}

// ============================================================
// VR TRIGGER
// ============================================================

function getControllerRay(controller) {
	// Cập nhật ma trận thế giới trước khi lấy hướng
	controller.updateMatrixWorld(true);
	tempMatrix.identity().extractRotation(controller.matrixWorld);
	raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
	// Dùng hướng (0,0,-1) trong không gian local của controller, chuyển sang world
	raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();
}

async function onVRTrigger(event) {
	const controller = event.target;
	getControllerRay(controller);

	if (vrMenuVisible) {
		const hits = raycaster.intersectObjects(menuSprites);
		if (hits.length > 0) {
			const idx = hits[0].object.userData.menuIndex;
			MENU_ITEMS[idx].action();
			hideVRMenu();
		}
		return;
	}

	if (inspectMode) {
		const hitBtn = raycaster.intersectObject(stopBtnSprite);
		if (hitBtn.length > 0) {
			selfRotationPaused = !selfRotationPaused;
			spinVelocity = 0;
			updateStopBtn();
			return;
		}
		if (currentPlanetData?.mesh === earth) {
			const hitEarth = raycaster.intersectObject(earth);
			if (hitEarth.length > 0) {
				const uv = hitEarth[0].uv;
				const lon = (uv.x * 360) - 180;
				const lat = (uv.y * 180) - 90;
				showCountryInfo('⏳ Đang tra cứu...');
				const country = await getCountryName(lat, lon);
				showCountryInfo(`<b style="color:#7df;font-size:18px;">${country}</b><br><span style="font-size:12px;color:#aaa;">Tọa độ: ${lat.toFixed(2)}, ${lon.toFixed(2)}</span>`);
			}
		}
	}
}

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

document.body.appendChild(VRButton.createButton(renderer));
window.addEventListener('dblclick', async (event) => {
	if (!inspectMode || !currentPlanetData || currentPlanetData.mesh !== earth || !selfRotationPaused) return;

	const mouse = new THREE.Vector2(
		(event.clientX / window.innerWidth) * 2 - 1,
		-(event.clientY / window.innerHeight) * 2 + 1
	);

	raycaster.setFromCamera(mouse, camera);
	const intersects = raycaster.intersectObject(earth);

	if (intersects.length > 0) {
		// Lấy tọa độ UV (giá trị từ 0 đến 1 trên bề mặt ảnh)
		const uv = intersects[0].uv;

		// Chuyển UV sang Kinh độ và Vĩ độ
		// UV.x (0 -> 1) tương ứng Kinh độ (-180 -> 180)
		// UV.y (0 -> 1) tương ứng Vĩ độ (-90 -> 90)
		const lon = (uv.x * 360) - 180;
		const lat = (uv.y * 180) - 90;

		showCountryInfo("⏳ Đang tra cứu...");

		const country = await getCountryName(lat, lon);

		showCountryInfo(`
            <b style="color:#7df;font-size:18px;">${country}</b><br>
            <span style="font-size:12px;color:#aaa;">Tọa độ: ${lat.toFixed(2)}°, ${lon.toFixed(2)}°</span>
        `);
	}
});