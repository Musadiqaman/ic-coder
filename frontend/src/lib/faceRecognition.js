import * as faceapi from "face-api.js";

const MODEL_URL = "/models";
let modelsLoaded = false;
let loadingPromise = null;

// Loads the three small models we actually need — detector, landmarks (needed to
// align the face before encoding), and the recognition net that produces the
// 128-length descriptor we store per student. Cached so repeat calls are free.
export function loadFaceModels() {
  if (modelsLoaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]).then(() => {
    modelsLoaded = true;
  });
  return loadingPromise;
}

export function areModelsLoaded() {
  return modelsLoaded;
}

// Runs detection + landmarks + descriptor extraction on a single video frame.
// Returns { descriptor: Float32Array(128), box } or null if no face was found.
export async function detectFace(videoEl) {
  const result = await faceapi
    .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;
  return { descriptor: Array.from(result.descriptor), box: result.detection.box };
}

// Euclidean distance between two 128-d descriptors. face-api.js's own recognition
// net is trained so that ~0.6 is the standard same/different-person cutoff.
export function descriptorDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export const MATCH_THRESHOLD = 0.55; // tighter than the 0.6 default -> fewer false accepts

// Finds the closest-matching student (by stored faceDescriptor) to a live descriptor.
// `students` is the raw list of student docs from the API (must include faceDescriptor).
export function findBestMatch(liveDescriptor, students) {
  let best = null;
  let bestDist = Infinity;
  for (const s of students) {
    if (!s.faceDescriptor || s.faceDescriptor.length !== 128) continue;
    const d = descriptorDistance(liveDescriptor, s.faceDescriptor);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  if (best && bestDist <= MATCH_THRESHOLD) return { student: best, distance: bestDist };
  return null;
}
