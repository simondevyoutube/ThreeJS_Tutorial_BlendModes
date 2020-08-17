import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';


const _VS = `
uniform float pointMultiplier;

attribute float size;
attribute float angle;
attribute float blend;
attribute vec4 colour;

varying vec4 vColour;
varying vec2 vAngle;
varying float vBlend;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size * pointMultiplier / gl_Position.w;

  vAngle = vec2(cos(angle), sin(angle));
  vColour = colour;
  vBlend = blend;
}`;

const _FS = `

uniform sampler2D diffuseTexture;

varying vec4 vColour;
varying vec2 vAngle;
varying float vBlend;

void main() {
  vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
  gl_FragColor = texture2D(diffuseTexture, coords) * vColour;
  gl_FragColor.xyz *= gl_FragColor.w;
  gl_FragColor.w *= vBlend;
}`;


const _VS_2 = `
uniform float pointMultiplier;

attribute float size;
attribute float angle;
attribute vec4 colour;

varying vec4 vColour;
varying vec2 vAngle;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size * pointMultiplier / gl_Position.w;

  vAngle = vec2(cos(angle), sin(angle));
  vColour = colour;
}`;

const _FS_2 = `

uniform sampler2D diffuseTexture;

varying vec4 vColour;
varying vec2 vAngle;

void main() {
  vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
  gl_FragColor = texture2D(diffuseTexture, coords) * vColour;
}`;


class LinearSpline {
  constructor(lerp) {
    this._points = [];
    this._lerp = lerp;
  }

  AddPoint(t, d) {
    this._points.push([t, d]);
  }

  Get(t) {
    let p1 = 0;

    for (let i = 0; i < this._points.length; i++) {
      if (this._points[i][0] >= t) {
        break;
      }
      p1 = i;
    }

    const p2 = Math.min(this._points.length - 1, p1 + 1);

    if (p1 == p2) {
      return this._points[p1][1];
    }

    return this._lerp(
        (t - this._points[p1][0]) / (
            this._points[p2][0] - this._points[p1][0]),
        this._points[p1][1], this._points[p2][1]);
  }
}


class ParticleSystem {
  constructor(params) {
    const uniforms = {
        diffuseTexture: {
            value: new THREE.TextureLoader().load('./resources/fire.png')
        },
        pointMultiplier: {
            value: window.innerHeight / (2.0 * Math.tan(0.5 * 60.0 * Math.PI / 180.0))
        }
    };

    this._material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: _VS,
        fragmentShader: _FS,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        vertexColors: true
    });

    this._camera = params.camera;
    this._particles = [];

    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    this._geometry.setAttribute('size', new THREE.Float32BufferAttribute([], 1));
    this._geometry.setAttribute('colour', new THREE.Float32BufferAttribute([], 4));
    this._geometry.setAttribute('angle', new THREE.Float32BufferAttribute([], 1));
    this._geometry.setAttribute('blend', new THREE.Float32BufferAttribute([], 1));

    this._points = new THREE.Points(this._geometry, this._material);

    params.parent.add(this._points);

    // Declare a few splines for different sets of particles. This isn't structured that well, we should
    // instead separate these out into new particle system instances with customizable parameters. But
    // for the purposes of a demo, more than enough.
    this._alphaSplineF = new LinearSpline((t, a, b) => {
      return a + t * (b - a);
    });
    this._alphaSplineF.AddPoint(0.0, 0.0);
    this._alphaSplineF.AddPoint(0.1, 1.0);
    this._alphaSplineF.AddPoint(0.5, 1.0);
    this._alphaSplineF.AddPoint(1.0, 0.0);

    this._colourSplineF = new LinearSpline((t, a, b) => {
      const c = a.clone();
      return c.lerp(b, t);
    });
    this._colourSplineF.AddPoint(0.0, new THREE.Color(0xFFFF80));
    this._colourSplineF.AddPoint(1.0, new THREE.Color(0xFF8080));

    this._sizeSplineF = new LinearSpline((t, a, b) => {
      return a + t * (b - a);
    });
    this._sizeSplineF.AddPoint(0.0, 1.0);
    this._sizeSplineF.AddPoint(0.25, 7.0);
    this._sizeSplineF.AddPoint(0.5, 2.5);
    this._sizeSplineF.AddPoint(1.0, 0.0);

    this._alphaSplineS = new LinearSpline((t, a, b) => {
      return a + t * (b - a);
    });
    this._alphaSplineS.AddPoint(0.0, 0.0);
    this._alphaSplineS.AddPoint(0.1, 1.0);
    this._alphaSplineS.AddPoint(0.5, 1.0);
    this._alphaSplineS.AddPoint(1.0, 0.0);

    this._colourSplineS = new LinearSpline((t, a, b) => {
      const c = a.clone();
      return c.lerp(b, t);
    });
    this._colourSplineS.AddPoint(0.0, new THREE.Color(0x202020));
    this._colourSplineS.AddPoint(1.0, new THREE.Color(0x000000));

    this._sizeSplineS = new LinearSpline((t, a, b) => {
      return a + t * (b - a);
    });
    this._sizeSplineS.AddPoint(0.0, 1.0);
    this._sizeSplineS.AddPoint(0.5, 8.0);
    this._sizeSplineS.AddPoint(1.0, 16.0);

    this._alphaSplineX = new LinearSpline((t, a, b) => {
      return a + t * (b - a);
    });
    this._alphaSplineX.AddPoint(0.0, 0.0);
    this._alphaSplineX.AddPoint(0.1, 1.0);
    this._alphaSplineX.AddPoint(0.9, 1.0);
    this._alphaSplineX.AddPoint(1.0, 0.0);

    this._colourSplineX = new LinearSpline((t, a, b) => {
      const c = a.clone();
      return c.lerp(b, t);
    });
    this._colourSplineX.AddPoint(0.0, new THREE.Color(0xFF8080));
    this._colourSplineX.AddPoint(1.0, new THREE.Color(0xFFFFFF));

    this._sizeSplineX = new LinearSpline((t, a, b) => {
      return a + t * (b - a);
    });
    this._sizeSplineX.AddPoint(0.0, 1.0);
    this._sizeSplineX.AddPoint(1.0, 1.0);

    this._rateLimiter = 0.0;

    this._UpdateGeometry();
  }

  _CreateParticleF() {
    const life = (Math.random() * 0.75 + 0.25) * 10.0;
    return {
        position: new THREE.Vector3(
            (Math.random() * 2 - 1) * 4.0,
            (Math.random() * 2 - 1) * 4.0,
            (Math.random() * 2 - 1) * 4.0),
        size: (Math.random() * 0.5 + 0.5) * 2.0,
        colour: new THREE.Color(),
        alpha: 1.0,
        life: life,
        maxLife: life,
        rotation: Math.random() * 2.0 * Math.PI,
        velocity: new THREE.Vector3(0, 5, 0),
        blend: 0.0,
    };
  }

  _CreateParticleX() {
    const life = (Math.random() * 0.75 + 0.25) * 2.0;
    const dirX = (Math.random() * 2.0 - 1.0) * 3.0;
    const dirY = (Math.random() * 2.0 - 1.0) * 3.0;
    return {
        position: new THREE.Vector3(
            (Math.random() * 2 - 1) * 4.0,
            10 + (Math.random() * 2 - 1) * 4.0,
            (Math.random() * 2 - 1) * 4.0),
        size: (Math.random() * 0.5 + 0.5) * 0.5,
        colour: new THREE.Color(),
        alpha: 1.0,
        life: life,
        maxLife: life,
        rotation: Math.random() * 2.0 * Math.PI,
        velocity: new THREE.Vector3(dirX, 10, dirY),
        blend: 0.0,
    };
  }

  _CreateParticleS() {
    const life = (Math.random() * 0.75 + 0.25) * 15.0;
    return {
        position: new THREE.Vector3(
            (Math.random() * 2 - 1) * 4.0,
            10 + (Math.random() * 2 - 1) * 4.0,
            (Math.random() * 2 - 1) * 4.0),
        size: (Math.random() * 0.5 + 0.5) * 2.0,
        colour: new THREE.Color(),
        alpha: 1.0,
        life: life,
        maxLife: life,
        rotation: Math.random() * 2.0 * Math.PI,
        velocity: new THREE.Vector3(0, 5, 0),
        blend: 1.0,
    };
  }

  _AddParticles(timeElapsed) {
    this._rateLimiter += timeElapsed;
    const n = Math.floor(this._rateLimiter * 120.0);
    this._rateLimiter -= n / 120.0;

    for (let i = 0; i < n; i++) {
      const p = this._CreateParticleF();
      this._particles.push(p);
    }
    for (let i = 0; i < n; i++) {
      const p = this._CreateParticleS();
      this._particles.push(p);
    }
    for (let i = 0; i < n * 2; i++) {
      const p = this._CreateParticleX();
      this._particles.push(p);
    }
  }

  _UpdateGeometry() {
    const positions = [];
    const sizes = [];
    const colours = [];
    const angles = [];
    const blends = [];

    const box = new THREE.Box3();
    for (let p of this._particles) {
      positions.push(p.position.x, p.position.y, p.position.z);
      colours.push(p.colour.r, p.colour.g, p.colour.b, p.alpha);
      sizes.push(p.currentSize);
      angles.push(p.rotation);
      blends.push(p.blend);

      box.expandByPoint(p.position);
    }

    this._geometry.setAttribute(
        'position', new THREE.Float32BufferAttribute(positions, 3));
    this._geometry.setAttribute(
        'size', new THREE.Float32BufferAttribute(sizes, 1));
    this._geometry.setAttribute(
        'colour', new THREE.Float32BufferAttribute(colours, 4));
    this._geometry.setAttribute(
        'angle', new THREE.Float32BufferAttribute(angles, 1));
    this._geometry.setAttribute(
        'blend', new THREE.Float32BufferAttribute(blends, 1));
  
    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.size.needsUpdate = true;
    this._geometry.attributes.colour.needsUpdate = true;
    this._geometry.attributes.angle.needsUpdate = true;
    this._geometry.attributes.blend.needsUpdate = true;

    this._geometry.boundingBox = box;
    this._geometry.boundingSphere = new THREE.Sphere();
    box.getBoundingSphere(this._geometry.boundingSphere);
  }

  _UpdateParticles(timeElapsed) {
    for (let p of this._particles) {
      p.life -= timeElapsed;
    }

    this._particles = this._particles.filter(p => {
      return p.life > 0.0;
    });

    for (let p of this._particles) {
      const t = 1.0 - p.life / p.maxLife;

      p.rotation += timeElapsed * 0.5;

      if (p.blend == 0.0) {
        if (p.velocity.x != 0.0) {
          p.alpha = this._alphaSplineX.Get(t);
          p.currentSize = p.size * this._sizeSplineX.Get(t);
          p.colour.copy(this._colourSplineX.Get(t));
        } else {
          p.alpha = this._alphaSplineF.Get(t);
          p.currentSize = p.size * this._sizeSplineF.Get(t);
          p.colour.copy(this._colourSplineF.Get(t));
        }
      } else {
        p.alpha = this._alphaSplineS.Get(t);
        p.currentSize = p.size * this._sizeSplineS.Get(t);
        p.colour.copy(this._colourSplineS.Get(t));
      }

      p.position.add(p.velocity.clone().multiplyScalar(timeElapsed));

      const drag = p.velocity.clone();
      drag.multiplyScalar(timeElapsed * 0.1);
      drag.x = Math.sign(p.velocity.x) * Math.min(Math.abs(drag.x), Math.abs(p.velocity.x));
      drag.y = Math.sign(p.velocity.y) * Math.min(Math.abs(drag.y), Math.abs(p.velocity.y));
      drag.z = Math.sign(p.velocity.z) * Math.min(Math.abs(drag.z), Math.abs(p.velocity.z));
      p.velocity.sub(drag);
    }

    this._particles.sort((a, b) => {
      const d1 = this._camera.position.distanceTo(a.position);
      const d2 = this._camera.position.distanceTo(b.position);

      if (d1 > d2) {
        return -1;
      }

      if (d1 < d2) {
        return 1;
      }

      return 0;
    });
  }

  Step(timeElapsed) {
    this._AddParticles(timeElapsed);
    this._UpdateParticles(timeElapsed);
    this._UpdateGeometry();
  }
}

class BlendingDemo {
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this._threejs.domElement);

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);


    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
        './resources/posx.jpg',
        './resources/negx.jpg',
        './resources/posy.jpg',
        './resources/negy.jpg',
        './resources/posz.jpg',
        './resources/negz.jpg',
    ]);

    this._backgroundScene = new THREE.Scene();
    this._backgroundScene.background = new THREE.Color(0x3f4f6a);

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000.0;
    this._backgroundCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._backgroundCamera.position.set(35, 10, 0);
    const controls = new OrbitControls(this._backgroundCamera, this._threejs.domElement);
    controls.target.set(0, 10, 0);
    controls.update();

    this._camera = new THREE.OrthographicCamera(0, 1920, 1280, 0, 0, 1);

    const mat = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load('./resources/fire.jpg'),
        depthTest: true,
        depthWrite: false,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
    });

    const postPlane = new THREE.PlaneBufferGeometry(800, 800);
    const postQuad = new THREE.Mesh(postPlane, mat);
    postQuad.position.set(
        1920 - (800 * 0.5 + (1280 - 800) * 0.5),
        1280 * 0.5, 0);

    this._scene = new THREE.Scene();
    // this._scene.add(postQuad);

    this._particles = new ParticleSystem({
        parent: this._backgroundScene,
        camera: this._backgroundCamera,
    });

    this._UpdateText();

    this._previousRAF = null;
    this._RAF();
  }

  _OnWindowResize() {
    this._backgroundCamera.aspect = window.innerWidth / window.innerHeight;
    this._backgroundCamera.updateProjectionMatrix();
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _UpdateText() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('func').innerText = 'Subtract';
    document.getElementById('src').innerText = 'ONE';
    document.getElementById('dst').innerText = 'ONE';
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._Step(t - this._previousRAF);
      this._threejs.autoClear = true;
      this._threejs.render(this._backgroundScene, this._backgroundCamera);
      this._threejs.autoClear = false;
      this._threejs.render(this._scene, this._camera);
      this._RAF();

      this._previousRAF = t;
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;

    this._particles.Step(timeElapsedS);
  }
}


let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new BlendingDemo();
});
