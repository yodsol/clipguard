import { EventEmitter } from 'events';
import os from 'os';

export interface HealthStatus {
  cpu: number;
  memory: number;
  isResponsive: boolean;
  uptime: number;
  lastCheck: number;
  detectorLatency: number;
  clipboardServiceActive: boolean;
  clipboardServiceErrors: number;
}

export interface ServiceEvent {
  type: 'error' | 'recovery' | 'health_check' | 'hang_detected' | 'restart_required';
  service?: string;
  message: string;
  timestamp: number;
  data?: Record<string, any>;
}

export interface WatchdogThresholds {
  healthCheckInterval: number;
  hangDetectionThreshold: number;
  cpuErrorBound: number;
  memoryErrorBound: number;
  detectorLatencyThreshold: number;
}

export default class WatchdogService extends EventEmitter {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastResponsiveTime = Date.now();
  private cpuHistory: number[] = [];
  private memoryHistory: number[] = [];
  private serviceEvents: ServiceEvent[] = [];
  private maxEventHistory = 1000;
  private thresholds: WatchdogThresholds = {
    healthCheckInterval: 5000,
    hangDetectionThreshold: 10000,
    cpuErrorBound: 80,
    memoryErrorBound: 500,
    detectorLatencyThreshold: 100,
  };

  private clipboardServiceActive = false;
  private clipboardServiceErrors = 0;
  private detectorLatency = 0;

  constructor() {
    super();
  }

  start(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.thresholds.healthCheckInterval);
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private performHealthCheck(): void {
    const cpuPercent = this.calculateCPUPercent();
    const memoryPercent = this.calculateMemoryPercent();
    const isResponsive = this.checkResponsiveness();

    this.cpuHistory.push(cpuPercent);
    this.memoryHistory.push(memoryPercent);

    if (this.cpuHistory.length > 60) this.cpuHistory.shift();
    if (this.memoryHistory.length > 60) this.memoryHistory.shift();

    this.recordServiceEvent({
      type: 'health_check',
      message: `Health check: CPU ${cpuPercent}%, Memory ${memoryPercent}%`,
      timestamp: Date.now(),
      data: { cpuPercent, memoryPercent, isResponsive },
    });

    if (!isResponsive) {
      this.recordServiceEvent({
        type: 'hang_detected',
        message: 'Process hang detected',
        timestamp: Date.now(),
      });
    }

    if (cpuPercent > this.thresholds.cpuErrorBound || memoryPercent > this.thresholds.memoryErrorBound) {
      this.recordServiceEvent({
        type: 'restart_required',
        message: `Resource limits exceeded: CPU ${cpuPercent}%, Memory ${memoryPercent}%`,
        timestamp: Date.now(),
      });
      this.emit('restart-required', { cpuPercent, memoryPercent });
    }
  }

  private calculateCPUPercent(): number {
    const loadavg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    return Math.min(100, (loadavg / cpuCount) * 100);
  }

  private calculateMemoryPercent(): number {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return (usedMem / totalMem) * 100;
  }

  private checkResponsiveness(): boolean {
    const now = Date.now();
    return now - this.lastResponsiveTime < this.thresholds.hangDetectionThreshold;
  }

  signalResponsive(): void {
    this.lastResponsiveTime = Date.now();
  }

  recordServiceEvent(event: ServiceEvent): void {
    this.serviceEvents.push(event);
    if (this.serviceEvents.length > this.maxEventHistory) {
      this.serviceEvents.shift();
    }
  }

  setClipboardServiceStatus(active: boolean, errors: number = 0): void {
    this.clipboardServiceActive = active;
    this.clipboardServiceErrors = errors;
  }

  setDetectorLatency(latencyMs: number): void {
    this.detectorLatency = latencyMs;
  }

  getHealthStatus(): HealthStatus {
    const uptime = process.uptime();
    const cpu = this.cpuHistory.length > 0 ? this.cpuHistory[this.cpuHistory.length - 1] : 0;
    const memory = this.memoryHistory.length > 0 ? this.memoryHistory[this.memoryHistory.length - 1] : 0;

    return {
      cpu,
      memory,
      isResponsive: this.checkResponsiveness(),
      uptime,
      lastCheck: Date.now(),
      detectorLatency: this.detectorLatency,
      clipboardServiceActive: this.clipboardServiceActive,
      clipboardServiceErrors: this.clipboardServiceErrors,
    };
  }

  getServiceEvents(filter?: { type?: string; service?: string }): ServiceEvent[] {
    if (!filter) return [...this.serviceEvents];

    return this.serviceEvents.filter((event) => {
      if (filter.type && event.type !== filter.type) return false;
      if (filter.service && event.service !== filter.service) return false;
      return true;
    });
  }

  configureThresholds(thresholds: Partial<WatchdogThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  getDiagnosticSummary(): Record<string, any> {
    const health = this.getHealthStatus();
    return {
      status: 'healthy',
      health,
      avgCpu: this.cpuHistory.length > 0 ? this.cpuHistory.reduce((a, b) => a + b) / this.cpuHistory.length : 0,
      avgMemory: this.memoryHistory.length > 0 ? this.memoryHistory.reduce((a, b) => a + b) / this.memoryHistory.length : 0,
      eventCount: this.serviceEvents.length,
      thresholds: this.thresholds,
    };
  }
}
