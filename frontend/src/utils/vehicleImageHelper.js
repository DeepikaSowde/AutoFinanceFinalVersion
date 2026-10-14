import { useState, useEffect } from 'react';

/**
 * Local public assets mapping for default vehicle images.
 * Stored locally in the public folder:
 * - /Two%20Wheeler.jpg
 * - /Three%20Wheeler.jpg
 * - /Four%20Wheeler.jpg
 */
export const DEFAULT_VEHICLE_IMAGES = {
  'Two Wheeler': '/Two%20Wheeler.jpg',
  'Three Wheeler': '/Three%20Wheeler.jpg',
  'Four Wheeler': '/Four%20Wheeler.jpg',
};

/**
 * Catalog of existing model-specific vehicle images in the public directory.
 * Includes keywords and tokens for fuzzy/normalized model matching.
 */
export const AVAILABLE_MODEL_IMAGES = [
  {
    type: 'Two Wheeler',
    path: '/two-wheeler-activa6G.jpg',
    keys: ['activa 6g', 'activa 6 g', 'activa6g', 'activa-6g', 'activa_6g'],
    modelTokens: ['activa'],
    variantTokens: ['6g', '6'],
  },
  {
    type: 'Two Wheeler',
    path: '/two-wheeler-activa125.jpg',
    keys: ['activa 125', 'activa125', 'activa-125', 'activa_125'],
    modelTokens: ['activa'],
    variantTokens: ['125'],
  },
  {
    type: 'Two Wheeler',
    path: '/two-wheeler-pulsar-125.jpg',
    keys: ['pulsar 125', 'pulsar125', 'pulsar-125', 'pulsar_125', 'pulsar'],
    modelTokens: ['pulsar'],
    variantTokens: ['125'],
  },
  {
    type: 'Two Wheeler',
    path: '/two-wheeler-splendor.jpeg',
    keys: ['splendor', 'splendor plus', 'splendorplus', 'splendor-plus', 'splendor+'],
    modelTokens: ['splendor'],
    variantTokens: ['plus'],
  },
];

/**
 * Normalizes vehicle type to standard keys ('Two Wheeler', 'Three Wheeler', 'Four Wheeler').
 *
 * @param {string} [vehicleType]
 * @returns {'Two Wheeler'|'Three Wheeler'|'Four Wheeler'}
 */
export const normalizeVehicleType = (vehicleType) => {
  if (!vehicleType) return 'Two Wheeler';
  const type = String(vehicleType).trim().toLowerCase();

  if (type.includes('three') || type.includes('3') || type.includes('auto') || type.includes('rickshaw')) {
    return 'Three Wheeler';
  }

  if (type.includes('four') || type.includes('4') || type.includes('car')) {
    return 'Four Wheeler';
  }

  return 'Two Wheeler';
};

/**
 * Normalizes vehicle model names and image filenames so differences in casing,
 * spacing, and common separators (hyphens, underscores, dots, plus signs) do not cause mismatches.
 *
 * @param {string} [str]
 * @returns {string}
 */
export const normalizeModelKey = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/^.*[\\/]/, '')
    .replace(/^(two|three|four)[-_ ]?wheeler[-_ ]?/i, '')
    .replace(/\.(jpe?g|png|webp|svg)$/i, '')
    .replace(/[-_.+]/g, ' ')
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .replace(/(\d)([a-z])/gi, '$1 $2')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Returns the default vehicle image path corresponding to the given vehicle type.
 * Supported types:
 * - 'Two Wheeler'
 * - 'Three Wheeler'
 * - 'Four Wheeler'
 *
 * @param {string} [vehicleType]
 * @returns {string} Path to default vehicle image in public directory.
 */
export const getDefaultVehicleImage = (vehicleType) => {
  const normType = normalizeVehicleType(vehicleType);
  return DEFAULT_VEHICLE_IMAGES[normType] || DEFAULT_VEHICLE_IMAGES['Two Wheeler'];
};

/**
 * Matches a vehicle model to an existing image asset in public/.
 * - For Two Wheeler: checks model matching against available two-wheeler images.
 *   If match exists, returns the model image path; otherwise falls back to /Two%20Wheeler.jpg.
 * - For Three Wheeler: checks model matching against available three-wheeler images.
 *   If match exists, returns the model image path; otherwise falls back to /Three%20Wheeler.jpg.
 * - For Four Wheeler: checks model matching or falls back to /Four%20Wheeler.jpg.
 *
 * @param {string} [vehicleType]
 * @param {string} [modelName]
 * @returns {string} Path to matched model image or vehicle-type default.
 */
export const getVehicleModelImage = (vehicleType, modelName) => {
  const normType = normalizeVehicleType(vehicleType);
  const defaultImage = getDefaultVehicleImage(vehicleType);

  if (!modelName) {
    return defaultImage;
  }

  const rawModel = String(modelName).trim();
  if (!rawModel) {
    return defaultImage;
  }

  const normalized = normalizeModelKey(rawModel);
  const compactModel = normalized.replace(/\s+/g, '');

  const typeCandidates = AVAILABLE_MODEL_IMAGES.filter(
    (item) => normalizeVehicleType(item.type) === normType
  );

  // 1. Direct key match (exact or stripped separators)
  for (const item of typeCandidates) {
    const compactPath = normalizeModelKey(item.path).replace(/\s+/g, '');
    if (compactModel === compactPath) {
      return item.path;
    }
    for (const key of item.keys) {
      if (compactModel === key.replace(/[-_.+ ]/g, '').toLowerCase()) {
        return item.path;
      }
    }
  }

  // 2. Token match with number conflict prevention (e.g., Activa 6G vs Activa 125)
  const modelNumbers = compactModel.match(/\d+/g) || [];
  for (const item of typeCandidates) {
    const itemKeyNumbers = item.keys.join(' ').match(/\d+/g) || [];

    // If both have numbers and they don't overlap, do not match (e.g. 125 vs 6)
    if (modelNumbers.length > 0 && itemKeyNumbers.length > 0) {
      const hasNumberMatch = modelNumbers.some((num) => itemKeyNumbers.includes(num));
      if (!hasNumberMatch) {
        continue;
      }
    }

    // Must match at least one modelToken (e.g. 'activa', 'pulsar', 'splendor')
    const matchesModelToken = item.modelTokens.some((token) => {
      const normToken = token.toLowerCase();
      return compactModel.includes(normToken) || normalized.includes(normToken);
    });

    if (matchesModelToken) {
      return item.path;
    }
  }

  return defaultImage;
};

/**
 * Extracts any customer-uploaded vehicle photo from a vehicle or loan record.
 * Handles:
 * - Object with `data` property (base64 string from fileToBase64)
 * - Object with `url` or `src` property
 * - Direct string (base64 data URI, blob URL, or static path)
 *
 * @param {Object} record - Vehicle record or loan record containing vehicle info.
 * @returns {string|null} The uploaded photo source, or null if none uploaded.
 */
export const getUploadedVehiclePhoto = (record) => {
  if (!record) return null;
  const vehicle = record.vehicle || record;
  const rawPhoto = vehicle.photo || vehicle.photoFile || record.photo || record.photoFile || null;

  if (!rawPhoto) return null;

  // Object containing base64 data (standard FileReader result in MotoLend)
  if (typeof rawPhoto === 'object' && typeof rawPhoto.data === 'string' && rawPhoto.data.trim()) {
    return rawPhoto.data.trim();
  }

  // Object containing url or src
  if (typeof rawPhoto === 'object' && typeof (rawPhoto.url || rawPhoto.src) === 'string') {
    const val = (rawPhoto.url || rawPhoto.src).trim();
    if (val) return val;
  }

  // Direct string (e.g. data URI or image URL)
  if (typeof rawPhoto === 'string' && rawPhoto.trim()) {
    return rawPhoto.trim();
  }

  return null;
};

/**
 * Resolves the vehicle image URL according to priority:
 * 1. Customer-uploaded vehicle photo if available and no prior error.
 * 2. Dynamic model image based on vehicle type and model.
 * 3. Default vehicle image based on vehicle type (fallback).
 *
 * @param {Object} record
 * @param {boolean} [hasError=false]
 * @returns {string}
 */
export const getVehicleDisplayImage = (record, hasError = false) => {
  const vehicle = record?.vehicle || record || {};
  const vehicleType = vehicle.type || record?.type || '';
  const vehicleModel = vehicle.model || record?.model || '';

  if (!hasError) {
    const uploaded = getUploadedVehiclePhoto(record);
    if (uploaded) return uploaded;
    return getVehicleModelImage(vehicleType, vehicleModel);
  }

  return getDefaultVehicleImage(vehicleType);
};

/**
 * React hook to manage vehicle image selection and fallback behavior:
 * - Stage 0: Displays customer-uploaded photo if present.
 * - Stage 1: If no photo or photo fails, displays dynamic model image (or type default).
 * - Stage 2: If model image fails, falls back to type default image.
 * - Stage 3: If type default image fails, sets hasFailed=true (allowing UI to show fallback SVG icon).
 * - Automatically resyncs whenever the vehicle record or uploaded photo changes.
 *
 * @param {Object} vehicleRecord
 * @returns {{
 *   imageSrc: string|null,
 *   isDefaultImage: boolean,
 *   hasFailed: boolean,
 *   handleImageError: () => void,
 *   defaultImage: string,
 *   uploadedPhoto: string|null
 * }}
 */
export const useVehicleImage = (vehicleRecord) => {
  const vehicle = vehicleRecord?.vehicle || vehicleRecord || {};
  const vehicleType = vehicle.type || vehicleRecord?.type || '';
  const vehicleModel = vehicle.model || vehicleRecord?.model || '';

  const uploadedPhoto = getUploadedVehiclePhoto(vehicleRecord);
  const modelImage = getVehicleModelImage(vehicleType, vehicleModel);
  const typeDefaultImage = getDefaultVehicleImage(vehicleType);

  const initialStage = uploadedPhoto ? 0 : 1;
  const [stage, setStage] = useState(initialStage);

  useEffect(() => {
    setStage(uploadedPhoto ? 0 : 1);
  }, [uploadedPhoto, modelImage, typeDefaultImage]);

  const handleImageError = () => {
    setStage((prev) => {
      if (prev === 0) {
        // Uploaded photo failed -> try modelImage
        return 1;
      }
      if (prev === 1) {
        // Model image failed -> if different from typeDefaultImage, try typeDefaultImage
        if (modelImage !== typeDefaultImage) {
          return 2;
        }
        return 3;
      }
      if (prev === 2) {
        // Type default image failed -> fallback to SVG icon
        return 3;
      }
      return 3;
    });
  };

  let imageSrc = null;
  let isDefault = false;

  if (stage === 0) {
    imageSrc = uploadedPhoto;
    isDefault = false;
  } else if (stage === 1) {
    imageSrc = modelImage;
    isDefault = true;
  } else if (stage === 2) {
    imageSrc = typeDefaultImage;
    isDefault = true;
  } else {
    imageSrc = null;
    isDefault = true;
  }

  const hasFailed = stage >= 3;

  return {
    imageSrc,
    isDefaultImage: isDefault,
    hasFailed,
    handleImageError,
    defaultImage: modelImage,
    uploadedPhoto,
  };
};
