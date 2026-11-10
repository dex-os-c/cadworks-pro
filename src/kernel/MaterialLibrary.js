// CADWorks Pro - Engineering Material Library
import * as THREE from 'three';
import { MATERIALS } from '../utils/constants';

export class MaterialLibrary {
  constructor() {
    this.materials = { ...MATERIALS };
    this.threeMaterialCache = new Map();
  }

  getMaterial(key) {
    return this.materials[key] || this.materials['Steel_1020'];
  }

  getAllMaterials() {
    return Object.entries(this.materials).map(([key, data]) => ({
      key,
      ...data,
    }));
  }

  addCustomMaterial(key, properties) {
    this.materials[key] = {
      name: properties.name || key,
      density: properties.density || 7850,
      youngsModulus: properties.youngsModulus || 200e9,
      poissonsRatio: properties.poissonsRatio || 0.3,
      yieldStrength: properties.yieldStrength || 250e6,
      color: properties.color || '#999999',
    };
    this.threeMaterialCache.delete(key);
  }

  getThreeMaterial(key, wireframe = false) {
    const cacheKey = `${key}_${wireframe}`;
    if (this.threeMaterialCache.has(cacheKey)) {
      return this.threeMaterialCache.get(cacheKey);
    }

    const data = this.getMaterial(key);
    const color = new THREE.Color(data.color || '#b0b0b0');

    // SolidWorks-style realistic metallic/dielectric shaders
    const isMetal = key.toLowerCase().includes('steel') ||
                    key.toLowerCase().includes('aluminum') ||
                    key.toLowerCase().includes('titanium') ||
                    key.toLowerCase().includes('copper') ||
                    key.toLowerCase().includes('brass') ||
                    key.toLowerCase().includes('iron');

    const material = new THREE.MeshStandardMaterial({
      color: color,
      metalness: isMetal ? 0.8 : 0.1,
      roughness: isMetal ? 0.35 : 0.6,
      wireframe: wireframe,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    this.threeMaterialCache.set(cacheKey, material);
    return material;
  }
}

export const materialLibrary = new MaterialLibrary();
export default MaterialLibrary;
