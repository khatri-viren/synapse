import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicNodeMaterial,
  Material,
  Vector3,
} from 'three/webgpu';
import { color as tslColor } from 'three/tsl';

import type { LogoId, NetworkPacketDebugSnapshot, SceneState } from '../scene/types';
import { CHOREOGRAPHY_TIMELINE } from '../scene/ChoreographyTimeline';
import type { ConnectionSystem } from './ConnectionSystem';
import {
  CONNECTION_ROUTE_SPECS,
  NETWORK_WIRE_COLOR,
  PACKET_DASH_LENGTH_U,
  PACKET_SPEED_U_PER_SECOND,
  packetCountForQuality,
} from './connectionConfig';

interface PacketDashRuntime {
  readonly line: Line;
  readonly positionAttribute: Float32BufferAttribute;
}

interface PacketRuntime {
  readonly id: LogoId;
  readonly dashes: readonly PacketDashRuntime[];
  readonly uValues: number[];
}

const MAX_PACKETS_PER_LINK = 4;
const tempPacketTail = new Vector3();
const tempPacketHead = new Vector3();

function fract(value: number): number {
  return value - Math.floor(value);
}

export class PacketSystem {
  readonly root = new Group();

  private readonly runtimes = new Map<LogoId, PacketRuntime>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private activePacketCount = 0;
  private configuredCountPerLink = 0;

  constructor() {
    this.root.name = 'packetSystem';
    this.createPackets();
  }

  update(
    state: Pick<SceneState, 'elapsedSeconds' | 'quality'>,
    connectionSystem: ConnectionSystem,
  ): void {
    const packetCount = packetCountForQuality(state.quality);
    this.configuredCountPerLink = packetCount;
    this.activePacketCount = 0;

    for (const routeSpec of CONNECTION_ROUTE_SPECS) {
      const runtime = this.requireRuntime(routeSpec.id);
      const reveal = connectionSystem.getReveal(routeSpec.id);
      const localTime = Math.max(
        0,
        state.elapsedSeconds -
          CHOREOGRAPHY_TIMELINE.linkActivation.start -
          routeSpec.activationDelay,
      );

      for (let index = 0; index < MAX_PACKETS_PER_LINK; index += 1) {
        const dash = runtime.dashes[index];
        if (dash === undefined) continue;
        const u = fract(
          localTime * PACKET_SPEED_U_PER_SECOND +
            routeSpec.packetPhase +
            index / MAX_PACKETS_PER_LINK,
        );
        runtime.uValues[index] = u;
        const endpointVisible = u > 0.025 && u < 0.975;
        const active =
          index < packetCount && reveal > 0.04 && u <= reveal && endpointVisible;
        dash.line.visible = active;

        if (!active) continue;

        connectionSystem.evaluatePosition(
          routeSpec.id,
          Math.max(0, u - PACKET_DASH_LENGTH_U),
          tempPacketTail,
        );
        connectionSystem.evaluatePosition(routeSpec.id, u, tempPacketHead);
        dash.positionAttribute.setXYZ(
          0,
          tempPacketTail.x,
          tempPacketTail.y,
          tempPacketTail.z,
        );
        dash.positionAttribute.setXYZ(
          1,
          tempPacketHead.x,
          tempPacketHead.y,
          tempPacketHead.z,
        );
        dash.positionAttribute.clearUpdateRanges();
        dash.positionAttribute.addUpdateRange(0, 6);
        dash.positionAttribute.needsUpdate = true;
        this.activePacketCount += 1;
      }
    }
  }

  getDebugSnapshot(): NetworkPacketDebugSnapshot {
    return {
      activeCount: this.activePacketCount,
      maximumCount: CONNECTION_ROUTE_SPECS.length * MAX_PACKETS_PER_LINK,
      configuredCountPerLink: this.configuredCountPerLink,
      direction: 'platform-to-brain',
      speedUPerSecond: PACKET_SPEED_U_PER_SECOND,
      depthTest: [...this.materials].every((material) => material.depthTest),
      depthWrite: [...this.materials].some((material) => material.depthWrite),
      links: CONNECTION_ROUTE_SPECS.map((spec) => {
        const runtime = this.requireRuntime(spec.id);
        return { id: spec.id, uValues: [...runtime.uValues] };
      }),
    };
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  isVisible(): boolean {
    return this.root.visible;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }

  private createPackets(): void {
    for (const spec of CONNECTION_ROUTE_SPECS) {
      const material = new LineBasicNodeMaterial({
        color: new Color(NETWORK_WIRE_COLOR),
        opacity: 0.98,
        transparent: true,
        blending: AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      });
      material.colorNode = tslColor(NETWORK_WIRE_COLOR).mul(2.7);
      const dashes: PacketDashRuntime[] = [];

      for (let index = 0; index < MAX_PACKETS_PER_LINK; index += 1) {
        const geometry = new BufferGeometry();
        const positionAttribute = new Float32BufferAttribute(new Float32Array(6), 3);
        positionAttribute.setUsage(DynamicDrawUsage);
        geometry.setAttribute('position', positionAttribute);
        geometry.setDrawRange(0, 2);

        const line = new Line(geometry, material);
        line.name = `inboundPacket:${spec.id}:${index}`;
        line.userData = {
          logoId: spec.id,
          packetIndex: index,
          role: 'inboundPacket',
          direction: 'platform-to-brain',
          style: 'moving-dash',
        };
        line.frustumCulled = false;
        line.renderOrder = 5;
        line.visible = false;
        dashes.push({ line, positionAttribute });
        this.geometries.add(geometry);
        this.root.add(line);
      }

      this.runtimes.set(spec.id, {
        id: spec.id,
        dashes,
        uValues: new Array<number>(MAX_PACKETS_PER_LINK).fill(0),
      });
      this.materials.add(material);
    }
  }

  private requireRuntime(id: LogoId): PacketRuntime {
    const runtime = this.runtimes.get(id);
    if (runtime === undefined) throw new Error(`Unknown packet route: ${id}`);
    return runtime;
  }
}
