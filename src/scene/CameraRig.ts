import { PerspectiveCamera, Vector3 } from 'three/webgpu';

import { COMPOSITION_SAFE_FRAME } from './compositionSpec';

const CAMERA_VERTICAL_FOV_DEGREES = 42;
const MIN_CAMERA_DISTANCE = 5;
const FIT_PADDING_WORLD_UNITS = 0.55;
const POINTER_DAMPING_PER_SECOND = 7.5;
const MAX_POINTER_OFFSET_X = 0.16;
const MAX_POINTER_OFFSET_Y = 0.1;

export interface CameraRigSnapshot {
  position: Vector3;
  target: Vector3;
}

export interface SupportFitSnapshot {
  allInFront: boolean;
  insideSafeFrame: boolean;
  insideViewport: boolean;
  maxAbsX: number;
  maxAbsY: number;
}

/**
 * Sole writer of the semantic camera pose and unjittered perspective projection.
 * Pointer input arrives as intent; no input handler writes camera fields directly.
 */
export class CameraRig {
  private readonly basePosition = new Vector3(0, 0, MIN_CAMERA_DISTANCE);
  private readonly baseTarget = new Vector3(0, 0, 0);
  private readonly currentTarget = new Vector3(0, 0, 0);
  private readonly desiredPosition = new Vector3();
  private readonly desiredTarget = new Vector3();
  private readonly pointerPositionOffset = new Vector3();
  private readonly pointerTargetOffset = new Vector3();
  private supportPoints: Vector3[] = [];

  constructor(private readonly camera: PerspectiveCamera) {
    this.camera.fov = CAMERA_VERTICAL_FOV_DEGREES;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.up.set(0, 1, 0);
    this.snapToBase();
  }

  fit(viewportWidth: number, viewportHeight: number, supportPoints: readonly Vector3[]): void {
    const width = Math.max(1, viewportWidth);
    const height = Math.max(1, viewportHeight);
    const aspect = width / height;
    const tanHalfFov = Math.tan((CAMERA_VERTICAL_FOV_DEGREES * Math.PI) / 360);
    let requiredCameraZ = MIN_CAMERA_DISTANCE;
    let minimumSupportZ = Number.POSITIVE_INFINITY;

    for (const point of supportPoints) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        throw new Error('Camera support points must be finite.');
      }

      const distanceForX = Math.abs(point.x) / (COMPOSITION_SAFE_FRAME.x * tanHalfFov * aspect);
      const distanceForY = Math.abs(point.y) / (COMPOSITION_SAFE_FRAME.y * tanHalfFov);
      requiredCameraZ = Math.max(
        requiredCameraZ,
        point.z + Math.max(distanceForX, distanceForY) + FIT_PADDING_WORLD_UNITS,
      );
      minimumSupportZ = Math.min(minimumSupportZ, point.z);
    }

    this.supportPoints = supportPoints.map((point) => point.clone());
    this.basePosition.set(0, 0, requiredCameraZ);
    this.camera.aspect = aspect;
    this.camera.near = 0.1;
    this.camera.far = Math.max(30, requiredCameraZ - minimumSupportZ + 8);
    this.camera.updateProjectionMatrix();
    this.snapToBase();
  }

  update(
    deltaSeconds: number,
    pointerNdc: Readonly<{ x: number; y: number }>,
    pointerStrength: number,
    pointerEnabled: boolean,
  ): void {
    const strength = pointerEnabled ? Math.min(Math.max(pointerStrength, 0), 1) : 0;
    const pointerX = Math.min(Math.max(pointerNdc.x, -1), 1) * strength;
    const pointerY = Math.min(Math.max(pointerNdc.y, -1), 1) * strength;

    this.pointerPositionOffset.set(pointerX * MAX_POINTER_OFFSET_X, pointerY * MAX_POINTER_OFFSET_Y, 0);
    this.pointerTargetOffset.set(pointerX * 0.018, pointerY * 0.012, 0);
    this.desiredPosition.copy(this.basePosition).add(this.pointerPositionOffset);
    this.desiredTarget.copy(this.baseTarget).add(this.pointerTargetOffset);

    const dampingAlpha = 1 - Math.exp(-POINTER_DAMPING_PER_SECOND * Math.max(deltaSeconds, 0));
    this.camera.position.lerp(this.desiredPosition, dampingAlpha);
    this.currentTarget.lerp(this.desiredTarget, dampingAlpha);
    this.commitPose();
  }

  snapToBase(): void {
    this.camera.position.copy(this.basePosition);
    this.currentTarget.copy(this.baseTarget);
    this.commitPose();
  }

  getSnapshot(): CameraRigSnapshot {
    return {
      position: this.camera.position.clone(),
      target: this.currentTarget.clone(),
    };
  }

  validateSupportFit(): SupportFitSnapshot {
    this.camera.updateMatrixWorld(true);

    let allInFront = true;
    let insideSafeFrame = true;
    let insideViewport = true;
    let maxAbsX = 0;
    let maxAbsY = 0;

    for (const point of this.supportPoints) {
      const viewPoint = point.clone().applyMatrix4(this.camera.matrixWorldInverse);
      const ndcPoint = point.clone().project(this.camera);
      const absX = Math.abs(ndcPoint.x);
      const absY = Math.abs(ndcPoint.y);

      allInFront &&= viewPoint.z < 0 && Number.isFinite(ndcPoint.x) && Number.isFinite(ndcPoint.y);
      insideSafeFrame &&= absX <= COMPOSITION_SAFE_FRAME.x && absY <= COMPOSITION_SAFE_FRAME.y;
      insideViewport &&= absX <= 1 && absY <= 1;
      maxAbsX = Math.max(maxAbsX, absX);
      maxAbsY = Math.max(maxAbsY, absY);
    }

    return {
      allInFront,
      insideSafeFrame,
      insideViewport,
      maxAbsX,
      maxAbsY,
    };
  }

  private commitPose(): void {
    this.camera.lookAt(this.currentTarget);
    this.camera.updateMatrixWorld(true);
  }
}
