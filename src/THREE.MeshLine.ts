import * as THREE from 'three'

function memcpy(src: any, srcOffset: number, dst: any, dstOffset: number, length: number) {
	let i

	src = src.subarray || src.slice ? src : src.buffer
	dst = dst.subarray || dst.slice ? dst : dst.buffer

	src = srcOffset ? src.subarray ?
		src.subarray(srcOffset, length && srcOffset + length) :
		src.slice(srcOffset, length && srcOffset + length) : src

	if (dst.set) {
		dst.set(src, dstOffset)
	} else {
		for (i = 0; i < src.length; i++) {
			dst[i + dstOffset] = src[i]
		}
	}

	return dst
}


THREE.ShaderChunk['meshline_vert'] = [
	'',
	THREE.ShaderChunk.logdepthbuf_pars_vertex,
	THREE.ShaderChunk.fog_pars_vertex,
	'',
	'attribute vec3 previous;',
	'attribute vec3 next;',
	'attribute float side;',
	'attribute float width;',
	'attribute float counters;',
	'',
	'uniform vec2 resolution;',
	'uniform float lineWidth;',
	'uniform vec3 color;',
	'uniform float opacity;',
	'uniform float near;',
	'uniform float far;',
	'uniform float sizeAttenuation;',
	'',
	'varying vec2 vUV;',
	'varying vec4 vColor;',
	'varying float vCounters;',
	'',
	'vec2 fix( vec4 i, float aspect ) {',
	'',
	'    vec2 res = i.xy / i.w;',
	'    res.x *= aspect;',
	'	 vCounters = counters;',
	'    return res;',
	'',
	'}',
	'',
	'void main() {',
	'',
	'    float aspect = resolution.x / resolution.y;',
	'    float pixelWidthRatio = 1. / (resolution.x * projectionMatrix[0][0]);',
	'',
	'    vColor = vec4( color, opacity );',
	'    vUV = uv;',
	'',
	'    mat4 m = projectionMatrix * modelViewMatrix;',
	'    vec4 finalPosition = m * vec4( position, 1.0 );',
	'    vec4 prevPos = m * vec4( previous, 1.0 );',
	'    vec4 nextPos = m * vec4( next, 1.0 );',
	'',
	'    vec2 currentP = fix( finalPosition, aspect );',
	'    vec2 prevP = fix( prevPos, aspect );',
	'    vec2 nextP = fix( nextPos, aspect );',
	'',
	'    float pixelWidth = finalPosition.w * pixelWidthRatio;',
	'    float w = 1.8 * pixelWidth * lineWidth * width;',
	'',
	'    if( sizeAttenuation == 1. ) {',
	'        w = 1.8 * lineWidth * width;',
	'    }',
	'',
	'    vec2 dir;',
	'    if( nextP == currentP ) dir = normalize( currentP - prevP );',
	'    else if( prevP == currentP ) dir = normalize( nextP - currentP );',
	'    else {',
	'        vec2 dir1 = normalize( currentP - prevP );',
	'        vec2 dir2 = normalize( nextP - currentP );',
	'        dir = normalize( dir1 + dir2 );',
	'',
	'        vec2 perp = vec2( -dir1.y, dir1.x );',
	'        vec2 miter = vec2( -dir.y, dir.x );',
	'        //w = clamp( w / dot( miter, perp ), 0., 4. * lineWidth * width );',
	'',
	'    }',
	'',
	'    //vec2 normal = ( cross( vec3( dir, 0. ), vec3( 0., 0., 1. ) ) ).xy;',
	'    vec2 normal = vec2( -dir.y, dir.x );',
	'    normal.x /= aspect;',
	'    normal *= .5 * w;',
	'',
	'    vec4 offset = vec4( normal * side, 0.0, 1.0 );',
	'    finalPosition.xy += offset.xy;',
	'',
	'    gl_Position = finalPosition;',
	'',
	THREE.ShaderChunk.logdepthbuf_vertex,
	THREE.ShaderChunk.fog_vertex && '    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
	THREE.ShaderChunk.fog_vertex,
	'}'
].join('\r\n');

THREE.ShaderChunk['meshline_frag'] = [
	'',
	THREE.ShaderChunk.fog_pars_fragment,
	THREE.ShaderChunk.logdepthbuf_pars_fragment,
	'',
	'uniform sampler2D map;',
	'uniform sampler2D alphaMap;',
	'uniform float useMap;',
	'uniform float useAlphaMap;',
	'uniform float useDash;',
	'uniform float dashArray;',
	'uniform float dashOffset;',
	'uniform float dashRatio;',
	'uniform float visibility;',
	'uniform float alphaTest;',
	'uniform vec2 repeat;',
	'',
	'varying vec2 vUV;',
	'varying vec4 vColor;',
	'varying float vCounters;',
	'',
	'void main() {',
	'',
	THREE.ShaderChunk.logdepthbuf_fragment,
	'',
	'    vec4 c = vColor;',
	'    if( useMap == 1. ) c *= texture2D( map, vUV * repeat );',
	'    if( useAlphaMap == 1. ) c.a *= texture2D( alphaMap, vUV * repeat ).a;',
	'    if( c.a < alphaTest ) discard;',
	'    if( useDash == 1. ){',
	'        c.a *= ceil(mod(vCounters + dashOffset, dashArray) - (dashArray * dashRatio));',
	'    }',
	'    gl_FragColor = c;',
	'    gl_FragColor.a *= step(vCounters, visibility);',
	'',
	THREE.ShaderChunk.fog_fragment,
	'}'
].join('\r\n');


export class MeshLine {
	private attributes: {
		position: THREE.BufferAttribute
		previous: THREE.BufferAttribute
		next: THREE.BufferAttribute
		side: THREE.BufferAttribute
		width: THREE.BufferAttribute
		uv: THREE.BufferAttribute
		index: THREE.BufferAttribute
		counters: THREE.BufferAttribute
	}

	private positions = []

	private previous = []
	private next = []
	private side = []
	private width = []
	private indices_array = []
	private uvs = []
	private counters = []
	private geometry: THREE.BufferGeometry = new THREE.BufferGeometry()

	private widthCallback = null

	// Used to ray cast
	private matrixWorld = new THREE.Matrix4()

	constructor() { }

	setMatrixWorld(matrixWorld: THREE.Matrix4) {
		this.matrixWorld = matrixWorld
	}

	setGeometry(g: THREE.Geometry | THREE.BufferGeometry | Float32Array | number[], c: any) {
		this.widthCallback = c

		this.positions = []
		this.counters = []

		if (g instanceof THREE.Geometry) {
			for (let j = 0; j < g.vertices.length; j++) {
				const v = g.vertices[j]
				const c = j / g.vertices.length
				this.positions.push(v.x, v.y, v.z)
				this.positions.push(v.x, v.y, v.z)
				this.counters.push(c)
				this.counters.push(c)
			}
		}

		if (g instanceof THREE.BufferGeometry) {
			// read attribute positions ?
		}

		if (g instanceof Float32Array || g instanceof Array) {
			for (var j = 0; j < g.length; j += 3) {
				const c = j / g.length
				this.positions.push(g[j], g[j + 1], g[j + 2])
				this.positions.push(g[j], g[j + 1], g[j + 2])
				this.counters.push(c)
				this.counters.push(c)
			}
		}

		this.process()
	}

	compareV3(a: number, b: number) {
		const aa = a * 6
		const ab = b * 6
		return (this.positions[aa] === this.positions[ab]) && (this.positions[aa + 1] === this.positions[ab + 1]) && (this.positions[aa + 2] === this.positions[ab + 2])

	}

	copyV3(a: number) {
		const aa = a * 6
		return [this.positions[aa], this.positions[aa + 1], this.positions[aa + 2]]
	}

	process() {
		const l = this.positions.length / 6

		this.previous = []
		this.next = []
		this.side = []
		this.width = []
		this.indices_array = []
		this.uvs = []

		for (let j = 0; j < l; j++) {
			this.side.push(1)
			this.side.push(-1)
		}

		let w
		for (let j = 0; j < l; j++) {
			if (this.widthCallback) w = this.widthCallback(j / (l - 1))
			else w = 1
			this.width.push(w)
			this.width.push(w)
		}

		for (let j = 0; j < l; j++) {
			this.uvs.push(j / (l - 1), 0)
			this.uvs.push(j / (l - 1), 1)
		}

		let v

		if (this.compareV3(0, l - 1)) {
			v = this.copyV3(l - 2)
		} else {
			v = this.copyV3(0)
		}

		this.previous.push(v[0], v[1], v[2])
		this.previous.push(v[0], v[1], v[2])

		for (let j = 0; j < l - 1; j++) {
			v = this.copyV3(j)
			this.previous.push(v[0], v[1], v[2])
			this.previous.push(v[0], v[1], v[2])
		}

		for (let j = 1; j < l; j++) {
			v = this.copyV3(j)
			this.next.push(v[0], v[1], v[2])
			this.next.push(v[0], v[1], v[2])
		}

		if (this.compareV3(l - 1, 0)) {
			v = this.copyV3(1)
		} else {
			v = this.copyV3(l - 1)
		}
		this.next.push(v[0], v[1], v[2])
		this.next.push(v[0], v[1], v[2])

		for (let j = 0; j < l - 1; j++) {
			let n = j * 2
			this.indices_array.push(n, n + 1, n + 2)
			this.indices_array.push(n + 2, n + 1, n + 3)
		}

		if (!this.attributes) {
			this.attributes = {
				position: new THREE.BufferAttribute(new Float32Array(this.positions), 3),
				previous: new THREE.BufferAttribute(new Float32Array(this.previous), 3),
				next: new THREE.BufferAttribute(new Float32Array(this.next), 3),
				side: new THREE.BufferAttribute(new Float32Array(this.side), 1),
				width: new THREE.BufferAttribute(new Float32Array(this.width), 1),
				uv: new THREE.BufferAttribute(new Float32Array(this.uvs), 2),
				index: new THREE.BufferAttribute(new Uint16Array(this.indices_array), 1),
				counters: new THREE.BufferAttribute(new Float32Array(this.counters), 1)
			}
		} else {
			this.attributes.position.copyArray(new Float32Array(this.positions))
			this.attributes.position.needsUpdate = true
			this.attributes.previous.copyArray(new Float32Array(this.previous))
			this.attributes.previous.needsUpdate = true
			this.attributes.next.copyArray(new Float32Array(this.next))
			this.attributes.next.needsUpdate = true
			this.attributes.side.copyArray(new Float32Array(this.side))
			this.attributes.side.needsUpdate = true
			this.attributes.width.copyArray(new Float32Array(this.width))
			this.attributes.width.needsUpdate = true
			this.attributes.uv.copyArray(new Float32Array(this.uvs))
			this.attributes.uv.needsUpdate = true
			this.attributes.index.copyArray(new Uint16Array(this.indices_array))
			this.attributes.index.needsUpdate = true
		}

		this.geometry.addAttribute('position', this.attributes.position)
		this.geometry.addAttribute('previous', this.attributes.previous)
		this.geometry.addAttribute('next', this.attributes.next)
		this.geometry.addAttribute('side', this.attributes.side)
		this.geometry.addAttribute('width', this.attributes.width)
		this.geometry.addAttribute('uv', this.attributes.uv)
		this.geometry.addAttribute('counters', this.attributes.counters)

		this.geometry.setIndex(this.attributes.index)
	}

	private rcInverseMatrix = new THREE.Matrix4()
	private rcRay = new THREE.Ray()
	private rcSphere = new THREE.Sphere()

	raycast(raycaster: THREE.Raycaster, intersects:any[]) {
		const precision = raycaster.linePrecision
		const precisionSq = precision * precision

		const geometry = this.geometry

		if (geometry.boundingSphere === null) geometry.computeBoundingSphere()

		// Checking boundingSphere distance to ray
		this.rcSphere.copy(geometry.boundingSphere)
		this.rcSphere.applyMatrix4(this.matrixWorld)

		const target = new THREE.Vector3();
		raycaster.ray.intersectSphere(this.rcSphere, target);

		if (target===undefined|| target === new THREE.Vector3()) return undefined

		this.rcInverseMatrix.getInverse(this.matrixWorld)
		this.rcRay.copy(raycaster.ray).applyMatrix4(this.rcInverseMatrix)

		const vStart = new THREE.Vector3()
		const vEnd = new THREE.Vector3()
		const interSegment = new THREE.Vector3()
		const interRay = new THREE.Vector3()
		const step = this instanceof THREE.LineSegments ? 2 : 1

		if (geometry instanceof THREE.BufferGeometry) {
			const index = geometry.index
			const attributes = geometry.attributes

			if (index !== null) {
				const indices = index.array
				const positions = attributes.position.array

				for (let i = 0, l = indices.length - 1; i < l; i += step) {
					const a = indices[i]
					const b = indices[i + 1]

					vStart.fromArray(positions, a * 3)
					vEnd.fromArray(positions, b * 3)

					const distSq = this.rcRay.distanceSqToSegment(vStart, vEnd, interRay, interSegment)

					if (distSq > precisionSq) continue

					interRay.applyMatrix4(this.matrixWorld) //Move back to world space for distance calculation

					const distance = raycaster.ray.origin.distanceTo(interRay)

					if (distance < raycaster.near || distance > raycaster.far) continue

					intersects.push({
						distance: distance,
						// What do we want? intersection point on the ray or on the segment??
						// point: raycaster.ray.at( distance ),
						point: interSegment.clone().applyMatrix4(this.matrixWorld),
						index: i,
						face: null,
						faceIndex: null,
						object: this,
					})
				}
			} else {
				const positions = attributes.position.array

				for (let i = 0, l = positions.length / 3 - 1; i < l; i += step) {
					vStart.fromArray(positions, 3 * i)
					vEnd.fromArray(positions, 3 * i + 3)

					const distSq = this.rcRay.distanceSqToSegment(vStart, vEnd, interRay, interSegment)

					if (distSq > precisionSq) continue

					interRay.applyMatrix4(this.matrixWorld) //Move back to world space for distance calculation

					const distance = raycaster.ray.origin.distanceTo(interRay)

					if (distance < raycaster.near || distance > raycaster.far) continue

					intersects.push({
						distance: distance,
						// What do we want? intersection point on the ray or on the segment??
						// point: raycaster.ray.at( distance ),
						point: interSegment.clone().applyMatrix4(this.matrixWorld),
						index: i,
						face: null,
						faceIndex: null,
						object: this,
					})
				}
			}
		}
	}

	/**
	 * Fast method to advance the line by one position.  The oldest position is removed.
	 */
	advance(position: THREE.Vector3) {
		const positions: any = this.attributes.position.array
		const previous: any = this.attributes.previous.array
		const next: any = this.attributes.next.array
		const l: number = positions.length

		// Previous
		memcpy(positions, 0, previous, 0, l)

		// Positions
		memcpy(positions, 6, positions, 0, l - 6)

		positions[l - 6] = position.x
		positions[l - 5] = position.y
		positions[l - 4] = position.z
		positions[l - 3] = position.x
		positions[l - 2] = position.y
		positions[l - 1] = position.z

		// Next
		memcpy(positions, 6, next, 0, l - 6)

		next[l - 6] = position.x
		next[l - 5] = position.y
		next[l - 4] = position.z
		next[l - 3] = position.x
		next[l - 2] = position.y
		next[l - 1] = position.z

		this.attributes.position.needsUpdate = true
		this.attributes.previous.needsUpdate = true
		this.attributes.next.needsUpdate = true
	}
}

export class MeshLineMaterial extends THREE.ShaderMaterial {
	private isMeshLineMaterial = true

	constructor(parameters:any) {
		super({
			uniforms: Object.assign({},
				THREE.UniformsLib.fog,
				{
					lineWidth: { value: 1 },
					map: { value: null },
					useMap: { value: 0 },
					alphaMap: { value: null },
					useAlphaMap: { value: 0 },
					color: { value: new THREE.Color(0xffffff) },
					opacity: { value: 1 },
					resolution: { value: new THREE.Vector2(1, 1) },
					sizeAttenuation: { value: 1 },
					near: { value: 1 },
					far: { value: 1 },
					dashArray: { value: 0 },
					dashOffset: { value: 0 },
					dashRatio: { value: 0.5 },
					useDash: { value: 0 },
					visibility: { value: 1 },
					alphaTest: { value: 0 },
					repeat: { value: new THREE.Vector2(1, 1) },
				}
			),

			vertexShader: THREE.ShaderChunk.meshline_vert,

			fragmentShader: THREE.ShaderChunk.meshline_frag,

		})

		this.type = 'MeshLineMaterial';

		Object.defineProperties(this, {
			lineWidth: {
				enumerable: true,
				get: () => this.uniforms.lineWidth.value,
				set: (value:any) => this.uniforms.lineWidth.value = value,
			},

			map: {
				enumerable: true,
				get: () => this.uniforms.map.value,
				set: (value:any) => this.uniforms.map.value = value,
			},

			useMap: {
				enumerable: true,
				get: () => this.uniforms.useMap.value,
				set: (value:any) => this.uniforms.useMap.value = value,
			},

			alphaMap: {
				enumerable: true,
				get: () => this.uniforms.alphaMap.value,
				set: (value:any) => this.uniforms.alphaMap.value = value,
			},

			useAlphaMap: {
				enumerable: true,
				get: () => this.uniforms.useAlphaMap.value,
				set: (value:any) => this.uniforms.useAlphaMap.value = value,
			},

			color: {
				enumerable: true,
				get: () => this.uniforms.color.value,
				set: (value:any) => this.uniforms.color.value = value,
			},

			opacity: {
				enumerable: true,
				get: () => this.uniforms.opacity.value,
				set: (value:any) => this.uniforms.opacity.value = value,
			},

			resolution: {
				enumerable: true,
				get: () => this.uniforms.resolution.value,
				set: (value:any) => this.uniforms.resolution.value.copy(value),
			},

			sizeAttenuation: {
				enumerable: true,
				get: () => this.uniforms.sizeAttenuation.value,
				set: (value:any) => this.uniforms.sizeAttenuation.value = value,
			},

			near: {
				enumerable: true,
				get: () => this.uniforms.near.value,
				set: (value:any) => this.uniforms.near.value = value,
			},

			far: {
				enumerable: true,
				get: () => this.uniforms.far.value,
				set: (value:any) => this.uniforms.far.value = value,
			},

			dashArray: {
				enumerable: true,
				get: () => this.uniforms.dashArray.value,
				set: (value:any) => {
					this.uniforms.dashArray.value = value
					this.uniforms.useDash.value = (value !== 0) ? 1 : 0
				},
			},

			dashOffset: {
				enumerable: true,
				get: () => this.uniforms.dashOffset.value,
				set: (value:any) => this.uniforms.dashOffset.value = value,
			},

			dashRatio: {
				enumerable: true,
				get: () => this.uniforms.dashRatio.value,
				set: (value:any) => this.uniforms.dashRatio.value = value,
			},

			useDash: {
				enumerable: true,
				get: () => this.uniforms.useDash.value,
				set: (value:any) => this.uniforms.useDash.value = value,
			},

			visibility: {
				enumerable: true,
				get: () => this.uniforms.visibility.value,
				set: (value:any) => this.uniforms.visibility.value = value,
			},

			alphaTest: {
				enumerable: true,
				get: () => this.uniforms.alphaTest.value,
				set: (value:any) => this.uniforms.alphaTest.value = value,
			},

			repeat: {
				enumerable: true,
				get: () => this.uniforms.repeat.value,
				set: (value:any) => this.uniforms.repeat.value.copy(value),
			},
		})

		this.setValues(parameters);
	}

	copy(source: any) {
		THREE.ShaderMaterial.prototype.copy.call(this, source)

		this.uniforms.lineWidth = source.lineWidth
		this.uniforms.map = source.map
		this.uniforms.useMap = source.useMap
		this.uniforms.alphaMap = source.alphaMap
		this.uniforms.useAlphaMap = source.useAlphaMap
		this.uniforms.color.value.copy(source.color)
		this.uniforms.opacity = source.opacity
		this.uniforms.resolution.value.copy(source.resolution)
		this.uniforms.sizeAttenuation = source.sizeAttenuation
		this.uniforms.near = source.near
		this.uniforms.far = source.far
		this.uniforms.dashArray.value.copy(source.dashArray)
		this.uniforms.dashOffset.value.copy(source.dashOffset)
		this.uniforms.dashRatio.value.copy(source.dashRatio)
		this.uniforms.useDash = source.useDash
		this.uniforms.visibility = source.visibility
		this.uniforms.alphaTest = source.alphaTest
		this.uniforms.repeat.value.copy(source.repeat)

		return this
	}
}
