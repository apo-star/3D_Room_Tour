import {
  SRGBColorSpace,
  TextureLoader,
  WebGLCubeRenderTarget,
  FloatType,
  RepeatWrapping,
  LinearMipMapLinearFilter,
  NearestFilter,
  LinearFilter,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { loadingManager } from './loading-manager';
import { params } from './settings';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { userDevice } from '../utils/browser-detection';

export class Textures {
  constructor() {}

  async init(enigne) {
    this.engine = enigne;
    if (params.useCompressedTextures) {
      if (
        this.engine.renderer
          .getContext()
          .getExtension('WEBGL_compressed_texture_s3tc_srgb') === null
      ) {
        console.warn('WEBGL_compressed_texture_s3tc_srgb is not supported');
        params.useCompressedTextures = false;
      }

      this.ktx2Loader = new KTX2Loader(loadingManager);
      this.ktx2Loader.setTranscoderPath(`${params.paths.decoders_path}basis/`);
      this.ktx2Loader.detectSupport(this.engine.renderer);
    }

    this.rgbeLoader = new RGBELoader(loadingManager);

    if (userDevice.os.name === 'mac') {
      if (userDevice.browser.name === 'safari') {
        if (userDevice.browser.version === '12.1.2') {
          this.rgbeLoader.setDataType(FloatType);
        }
      }
    }

    if (userDevice.os.name === 'ios') window.createImageBitmap = undefined;

    this.textureLoader = new TextureLoader(loadingManager);

    this.path = params.paths.textures_path;

    this.textureLoader.setPath(this.path);
    this.rgbeLoader.setPath(this.path);
  }

  async load(reInit) {
    const promises = [].concat(
      params.textures.flatMap((texture) =>
        !texture.loadedTexture ? this.loadTexture(texture, 'map') : []
      ),
      params.models.samara.assetsArray.flatMap((asset) => {
        asset.texturesPromises = asset.texturesPromises || [];

        return reInit || asset.name === this.engine.assets.initialAsset
          ? asset.textures.flatMap((texture) => {
              if (!texture.loadedTexture) {
                const promise = this.loadTexture(texture, 'map');
                asset.texturesPromises.push(promise);
                return promise;
              }
              return [];
            })
          : [];
      }),
      !reInit
        ? params.environment.assetsArray.flatMap(async (el) => {
            if (params.loadOnDemand.enabled && el.isDefault) {
              return this.loadTexture(el, 'pmrem');
            } else {
              return Promise.resolve({ name: el.name, status: 'skipped' });
            }
          })
        : []
    );

    return Promise.all(promises);
  }

  getHdrTexture(name) {
    return params.environment.assetsArray.find(
      (texture) => texture.name === name
    ).loadedHDRTexture;
  }

  getTexture(textName) {
    let texture = params.textures.find((texture) => texture.name === textName);
    if (!texture) {
      params.models.samara.assetsArray.filter((el) =>
        el.textures.some((item) => {
          if (item.name === textName) {
            texture = item;
          }
        })
      );
    }
    if (!texture) {
      console.error(textName);
      return;
    }
    return texture.loadedTexture;
  }

  async loadTexture(obj, textureType) {
    try {
      if (textureType === 'pmrem') {
        const hdr = await this.rgbeLoader.loadAsync(obj.hdrTexturePath);
        const cubeRenderTarget = new WebGLCubeRenderTarget(
          256
        ).fromEquirectangularTexture(this.engine.renderer, hdr);
        obj.loadedHDRTexture = cubeRenderTarget.texture;
      }

      if (textureType === 'map') {
        if (!obj.loadedTexture) {
          const texture =
            obj.ktxPath && params.useCompressedTextures
              ? await this.ktx2Loader.loadAsync(this.path + obj.ktxPath)
              : await this.textureLoader.loadAsync(obj.path);
          this.setupTexture(texture, obj);
          obj.loadedTexture = texture;
        }
      }

      return Promise.resolve({ [obj.name]: 'loaded' });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  setupTexture(texture, obj) {
    if (obj.anisotropy) {
      texture.anisotropy = this.engine.renderer.capabilities.getMaxAnisotropy();
    }

    if (obj.repeat) {
      texture.wrapT = texture.wrapS = RepeatWrapping;
      obj.repeatSet && texture.repeat.set(obj.repeatSet, obj.repeatSet);
    }

    if (!obj.nonSrgb) {
      texture.colorSpace = SRGBColorSpace;
    }

    if (obj.rotation) {
      texture.rotation = obj.rotation;
    }
    // Add minFilter and magFilter
    // if (obj.filter) {
    //   texture.minFilter = LinearFilter;
    //   texture.magFilter = LinearFilter;
    // }

    if (!obj.flip) {
      texture.flipY = false;
    }
  }
}
