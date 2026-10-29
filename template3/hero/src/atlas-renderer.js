import { frameBlendAt } from './expression-field.js';

const VERTEX = `attribute vec2 position;
varying vec2 uv;
void main() { uv = (position + 1.0) * 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;
const FRAGMENT = `precision highp float;
varying vec2 uv;
uniform sampler2D firstImage;
uniform sampler2D secondImage;
uniform vec2 firstTile;
uniform vec2 secondTile;
uniform float cell;
uniform float grid;
uniform float fraction;
void main() {
  vec2 pixel = mix(vec2(0.5), vec2(cell - 0.5), vec2(uv.x, 1.0 - uv.y));
  vec2 a = (firstTile * cell + pixel) / (cell * grid);
  vec2 b = (secondTile * cell + pixel) / (cell * grid);
  gl_FragColor = mix(texture2D(firstImage, a), texture2D(secondImage, b), fraction);
}`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source); gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(result); gl.deleteShader(result); throw new Error(error);
  }
  return result;
}

async function bitmap(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Expression atlas unavailable: ${response.status}`);
  const blob = await response.blob();
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const objectURL = URL.createObjectURL(blob);
  try { const image = new Image(); image.src = objectURL; await image.decode(); return image; }
  finally { URL.revokeObjectURL(objectURL); }
}

export async function createAtlasRenderer(canvas, manifest, signal) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: true, powerPreference: 'low-power' });
  const small = !gl || matchMedia('(max-width: 767px), (pointer: coarse)').matches || (navigator.deviceMemory ?? 8) <= 4
    || (gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) < manifest.variants.desktop.cellSize * manifest.variants.desktop.grid);
  const name = small ? 'mobile' : 'desktop';
  const variant = manifest.variants[name];
  const { grid, cellSize: cell } = variant;
  const perSheet = grid * grid;
  const images = [], textures = [];
  let program = null, buffer = null;

  function dispose() {
    for (const image of images) image.close?.();
    if (gl) {
      for (const texture of textures) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
  }

  try {
    if (gl) {
      const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX), fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment);
      gl.linkProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(gl.getUniformLocation(program, 'firstImage'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'secondImage'), 1);
      gl.uniform1f(gl.getUniformLocation(program, 'cell'), cell);
      gl.uniform1f(gl.getUniformLocation(program, 'grid'), grid);
    }
    // Decode/upload one sheet at a time and release CPU bitmaps after upload.
    for (const url of variant.urls) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const image = await bitmap(url, signal);
      if (signal.aborted) { image.close?.(); throw new DOMException('Aborted', 'AbortError'); }
      if (gl) {
        const texture = gl.createTexture(); textures.push(texture);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        image.close?.();
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Expression atlas exceeds available graphics memory');
      } else images.push(image);
    }
    const context = gl ? null : canvas.getContext('2d', { alpha: false });
    if (!gl && !context) throw new Error('Canvas expression rendering is unavailable');
    const firstTile = gl && gl.getUniformLocation(program, 'firstTile');
    const secondTile = gl && gl.getUniformLocation(program, 'secondTile');
    const fraction = gl && gl.getUniformLocation(program, 'fraction');
    let draws = 0;
    return {
      draw(value) {
        const { a, b, mix } = frameBlendAt(value, manifest.frameCount);
        const sheetA = Math.floor(a / perSheet), sheetB = Math.floor(b / perSheet);
        const tileA = a % perSheet, tileB = b % perSheet;
        if (gl) {
          if (gl.isContextLost()) throw new Error('Expression graphics context was lost');
          gl.useProgram(program); gl.viewport(0, 0, canvas.width, canvas.height);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, textures[sheetA]);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[sheetB]);
          gl.uniform2f(firstTile, tileA % grid, Math.floor(tileA / grid));
          gl.uniform2f(secondTile, tileB % grid, Math.floor(tileB / grid));
          gl.uniform1f(fraction, mix); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else {
          context.globalAlpha = 1;
          context.drawImage(images[sheetA], (tileA % grid) * cell, Math.floor(tileA / grid) * cell, cell, cell, 0, 0, canvas.width, canvas.height);
          if (mix > 0) {
            context.globalAlpha = mix;
            context.drawImage(images[sheetB], (tileB % grid) * cell, Math.floor(tileB / grid) * cell, cell, cell, 0, 0, canvas.width, canvas.height);
            context.globalAlpha = 1;
          }
        }
        draws++;
      },
      destroy: dispose,
      get state() { return { mode: gl ? 'webgl' : '2d', variant: name, draws, textureBytes: variant.textureBytes }; },
    };
  } catch (error) { dispose(); throw error; }
}
