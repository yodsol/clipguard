import WatchdogService, { HealthStatus, ServiceEvent, WatchdogThresholds } from '../watchdog-service';
import os from 'os';

// Mock os module
jest.mock('os');

describe('WatchdogService', () => {
  let watchdogService: WatchdogService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock os.loadavg() - returns array with 1-min, 5-min, 15-min averages
    (os.loadavg as jest.Mock).mockReturnValue([1.5, 1.2, 1.0]);

    // Mock os.cpus() - return array of CPU cores
    (os.cpus as jest.Mock).mockReturnValue([
      { model: 'CPU', speed: 2400 },
      { model: 'CPU', speed: 2400 },
      { model: 'CPU', speed: 2400 },
      { model: 'CPU', speed: 2400 },
    ]);

    // Mock os.totalmem() - 16GB
    (os.totalmem as jest.Mock).mockReturnValue(16 * 1024 * 1024 * 1024);

    // Mock os.freemem() - 8GB (50% free, 50% used)
    (os.freemem as jest.Mock).mockReturnValue(8 * 1024 * 1024 * 1024);

    watchdogService = new WatchdogService();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    watchdogService.stop();
  });

  describe('Lifecycle: start() and stop()', () => {
    it('should start health check interval', () => {
      expect(watchdogService['healthCheckInterval']).toBeNull();

      watchdogService.start();

      expect(watchdogService['healthCheckInterval']).not.toBeNull();
    });

    it('should not start multiple intervals if already running', () => {
      watchdogService.start();
      const firstInterval = watchdogService['healthCheckInterval'];

      watchdogService.start();

      expect(watchdogService['healthCheckInterval']).toBe(firstInterval);
    });

    it('should stop the health check interval', () => {
      watchdogService.start();
      expect(watchdogService['healthCheckInterval']).not.toBeNull();

      watchdogService.stop();

      expect(watchdogService['healthCheckInterval']).toBeNull();
    });

    it('should safely stop when not running', () => {
      expect(() => {
        watchdogService.stop();
      }).not.toThrow();
    });

    it('should clear interval on stop', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      watchdogService.start();
      watchdogService.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('performHealthCheck() - CPU calculation', () => {
    it('should calculate CPU percent from loadavg and cpu count', () => {
      (os.loadavg as jest.Mock).mockReturnValue([2.0, 1.5, 1.0]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({})); // 4 cores

      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();
      // (2.0 / 4) * 100 = 50%
      expect(healthStatus.cpu).toBe(50);
    });

    it('should cap CPU at 100 percent', () => {
      (os.loadavg as jest.Mock).mockReturnValue([5.0, 4.0, 3.0]);
      (os.cpus as jest.Mock).mockReturnValue(Array(2).fill({})); // 2 cores

      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();
      // (5.0 / 2) * 100 = 250%, but capped at 100
      expect(healthStatus.cpu).toEqual(100);
    });

    it('should handle single core systems', () => {
      (os.loadavg as jest.Mock).mockReturnValue([0.5, 0.4, 0.3]);
      (os.cpus as jest.Mock).mockReturnValue(Array(1).fill({})); // 1 core

      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();
      // (0.5 / 1) * 100 = 50%
      expect(healthStatus.cpu).toBe(50);
    });

    it('should use os.loadavg()[0] for 1-minute average', () => {
      (os.loadavg as jest.Mock).mockReturnValue([1.0, 5.0, 10.0]);

      watchdogService['performHealthCheck']();

      expect(os.loadavg).toHaveBeenCalled();
      // Verify 1-minute average was used (1.0, not 5.0 or 10.0)
      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.cpu).toBe(25); // (1.0 / 4) * 100
    });
  });

  describe('performHealthCheck() - Memory calculation', () => {
    it('should calculate memory percent from total and free memory', () => {
      const totalMem = 10 * 1024 * 1024 * 1024; // 10GB
      const freeMem = 2 * 1024 * 1024 * 1024; // 2GB free = 8GB used
      (os.totalmem as jest.Mock).mockReturnValue(totalMem);
      (os.freemem as jest.Mock).mockReturnValue(freeMem);

      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();
      // (8 / 10) * 100 = 80%
      expect(healthStatus.memory).toBe(80);
    });

    it('should handle 100% memory usage', () => {
      (os.totalmem as jest.Mock).mockReturnValue(10 * 1024 * 1024 * 1024);
      (os.freemem as jest.Mock).mockReturnValue(0);

      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.memory).toBe(100);
    });

    it('should handle 0% memory usage', () => {
      const totalMem = 10 * 1024 * 1024 * 1024;
      (os.totalmem as jest.Mock).mockReturnValue(totalMem);
      (os.freemem as jest.Mock).mockReturnValue(totalMem);

      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.memory).toBe(0);
    });

    it('should call os.totalmem() and os.freemem()', () => {
      watchdogService['performHealthCheck']();

      expect(os.totalmem).toHaveBeenCalled();
      expect(os.freemem).toHaveBeenCalled();
    });

    it('should use correct formula: (totalMem - freeMem) / totalMem * 100', () => {
      const total = 1000;
      const free = 400;
      (os.totalmem as jest.Mock).mockReturnValue(total);
      (os.freemem as jest.Mock).mockReturnValue(free);

      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();
      // (1000 - 400) / 1000 * 100 = 60%
      expect(healthStatus.memory).toBe(60);
    });
  });

  describe('recordServiceEvent() - rolling buffer', () => {
    it('should record a service event', () => {
      const event: ServiceEvent = {
        type: 'error',
        message: 'Test error',
        timestamp: Date.now(),
      };

      watchdogService.recordServiceEvent(event);

      const events = watchdogService.getServiceEvents();
      expect(events.length).toBe(1);
      expect(events[0]).toEqual(event);
    });

    it('should maintain FIFO order for events', () => {
      const events = Array.from({ length: 5 }, (_, i) => ({
        type: 'error' as const,
        message: `Event ${i}`,
        timestamp: Date.now() + i,
      }));

      events.forEach((e) => watchdogService.recordServiceEvent(e));

      const recorded = watchdogService.getServiceEvents();
      expect(recorded[0].message).toBe('Event 0');
      expect(recorded[4].message).toBe('Event 4');
    });

    it('should enforce max event history of 1000', () => {
      // Add 1050 events
      for (let i = 0; i < 1050; i++) {
        watchdogService.recordServiceEvent({
          type: 'health_check',
          message: `Event ${i}`,
          timestamp: Date.now(),
        });
      }

      const events = watchdogService.getServiceEvents();
      expect(events.length).toBe(1000);
    });

    it('should drop oldest events when exceeding max buffer', () => {
      // Add 1005 events
      for (let i = 0; i < 1005; i++) {
        watchdogService.recordServiceEvent({
          type: 'health_check',
          message: `Event ${i}`,
          timestamp: Date.now(),
        });
      }

      const events = watchdogService.getServiceEvents();
      // First 5 should be dropped
      expect(events[0].message).toBe('Event 5');
      expect(events.length).toBe(1000);
    });

    it('should preserve event data when recording', () => {
      const event: ServiceEvent = {
        type: 'restart_required',
        service: 'clipboard',
        message: 'High CPU usage',
        timestamp: 1234567890,
        data: { cpu: 85, memory: 75 },
      };

      watchdogService.recordServiceEvent(event);

      const recorded = watchdogService.getServiceEvents()[0];
      expect(recorded.service).toBe('clipboard');
      expect(recorded.data).toEqual({ cpu: 85, memory: 75 });
    });
  });

  describe('setClipboardServiceStatus()', () => {
    it('should set clipboard service status to active', () => {
      watchdogService.setClipboardServiceStatus(true, 0);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceActive).toBe(true);
    });

    it('should set clipboard service status to inactive', () => {
      watchdogService.setClipboardServiceStatus(false, 0);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceActive).toBe(false);
    });

    it('should track service error count', () => {
      watchdogService.setClipboardServiceStatus(true, 5);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceErrors).toBe(5);
    });

    it('should update error count on subsequent calls', () => {
      watchdogService.setClipboardServiceStatus(true, 3);
      let healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceErrors).toBe(3);

      watchdogService.setClipboardServiceStatus(true, 7);
      healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceErrors).toBe(7);
    });

    it('should allow zero errors', () => {
      watchdogService.setClipboardServiceStatus(true, 0);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceErrors).toBe(0);
    });

    it('should default error count to 0 if not provided', () => {
      watchdogService.setClipboardServiceStatus(true);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceErrors).toBe(0);
    });

    it('should track both active status and error count independently', () => {
      watchdogService.setClipboardServiceStatus(true, 5);
      let healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceActive).toBe(true);
      expect(healthStatus.clipboardServiceErrors).toBe(5);

      watchdogService.setClipboardServiceStatus(false, 5);
      healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.clipboardServiceActive).toBe(false);
      expect(healthStatus.clipboardServiceErrors).toBe(5);
    });
  });

  describe('setDetectorLatency()', () => {
    it('should record detector latency in milliseconds', () => {
      watchdogService.setDetectorLatency(42);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.detectorLatency).toBe(42);
    });

    it('should update latency on subsequent calls', () => {
      watchdogService.setDetectorLatency(50);
      let healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.detectorLatency).toBe(50);

      watchdogService.setDetectorLatency(75);
      healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.detectorLatency).toBe(75);
    });

    it('should handle zero latency', () => {
      watchdogService.setDetectorLatency(0);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.detectorLatency).toBe(0);
    });

    it('should handle high latency values', () => {
      watchdogService.setDetectorLatency(9999);

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.detectorLatency).toBe(9999);
    });
  });

  describe('signalResponsive() - responsiveness tracking', () => {
    it('should update last responsive time', () => {
      const beforeTime = Date.now();
      watchdogService.signalResponsive();
      const afterTime = Date.now();

      const lastResponsiveTime = watchdogService['lastResponsiveTime'];
      expect(lastResponsiveTime).toBeGreaterThanOrEqual(beforeTime);
      expect(lastResponsiveTime).toBeLessThanOrEqual(afterTime);
    });

    it('should mark service as responsive when called', () => {
      watchdogService.signalResponsive();

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.isResponsive).toBe(true);
    });

    it('should reset responsiveness timeout on each call', () => {
      watchdogService.signalResponsive();
      jest.advanceTimersByTime(5000); // Move forward 5 seconds

      watchdogService.signalResponsive();
      jest.advanceTimersByTime(5000); // Move forward another 5 seconds

      const healthStatus = watchdogService.getHealthStatus();
      // Still responsive because we just called signalResponsive()
      expect(healthStatus.isResponsive).toBe(true);
    });
  });

  describe('getHealthStatus() - return structure', () => {
    it('should return HealthStatus object with all required fields', () => {
      watchdogService.setClipboardServiceStatus(true, 2);
      watchdogService.setDetectorLatency(35);
      watchdogService.signalResponsive();
      watchdogService['performHealthCheck']();

      const healthStatus = watchdogService.getHealthStatus();

      expect(healthStatus).toHaveProperty('cpu');
      expect(healthStatus).toHaveProperty('memory');
      expect(healthStatus).toHaveProperty('isResponsive');
      expect(healthStatus).toHaveProperty('uptime');
      expect(healthStatus).toHaveProperty('lastCheck');
      expect(healthStatus).toHaveProperty('detectorLatency');
      expect(healthStatus).toHaveProperty('clipboardServiceActive');
      expect(healthStatus).toHaveProperty('clipboardServiceErrors');
    });

    it('should return latest CPU and memory values from history', () => {
      watchdogService['cpuHistory'] = [10, 20, 30];
      watchdogService['memoryHistory'] = [40, 50, 60];

      const healthStatus = watchdogService.getHealthStatus();

      expect(healthStatus.cpu).toBe(30); // Last value
      expect(healthStatus.memory).toBe(60); // Last value
    });

    it('should return 0 CPU when no history exists', () => {
      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.cpu).toBe(0);
    });

    it('should return 0 memory when no history exists', () => {
      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.memory).toBe(0);
    });

    it('should return current process uptime', () => {
      const beforeUptime = process.uptime();
      const healthStatus = watchdogService.getHealthStatus();
      const afterUptime = process.uptime();

      expect(healthStatus.uptime).toBeGreaterThanOrEqual(beforeUptime);
      expect(healthStatus.uptime).toBeLessThanOrEqual(afterUptime);
    });

    it('should return timestamp near current time', () => {
      const beforeTime = Date.now();
      const healthStatus = watchdogService.getHealthStatus();
      const afterTime = Date.now();

      expect(healthStatus.lastCheck).toBeGreaterThanOrEqual(beforeTime);
      expect(healthStatus.lastCheck).toBeLessThanOrEqual(afterTime);
    });

    it('should be of type HealthStatus interface', () => {
      const healthStatus = watchdogService.getHealthStatus();

      const isHealthStatus = (obj: any): obj is HealthStatus => {
        return (
          typeof obj.cpu === 'number' &&
          typeof obj.memory === 'number' &&
          typeof obj.isResponsive === 'boolean' &&
          typeof obj.uptime === 'number' &&
          typeof obj.lastCheck === 'number' &&
          typeof obj.detectorLatency === 'number' &&
          typeof obj.clipboardServiceActive === 'boolean' &&
          typeof obj.clipboardServiceErrors === 'number'
        );
      };

      expect(isHealthStatus(healthStatus)).toBe(true);
    });
  });

  describe('Hang detection (no responsive signal > 10s)', () => {
    it('should detect hang when no signal for > hangDetectionThreshold', () => {
      watchdogService.signalResponsive();
      jest.advanceTimersByTime(11000); // Advance 11 seconds (threshold is 10s)

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.isResponsive).toBe(false);
    });

    it('should not detect hang when signal within threshold', () => {
      watchdogService.signalResponsive();
      jest.advanceTimersByTime(5000); // Advance 5 seconds

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.isResponsive).toBe(true);
    });

    it('should detect hang at exactly threshold boundary', () => {
      watchdogService.signalResponsive();
      jest.advanceTimersByTime(10001); // Just over 10 seconds

      const healthStatus = watchdogService.getHealthStatus();
      // Should detect hang just past threshold
      expect(healthStatus.isResponsive).toBe(false);
    });

    it('should emit hang_detected event when hang occurs', () => {
      watchdogService.signalResponsive();
      const eventSpy = jest.fn();
      watchdogService.on('hang_detected', eventSpy);

      // Simulate hang condition and health check
      jest.advanceTimersByTime(11000);
      watchdogService['performHealthCheck']();

      // Check if hang_detected event was recorded
      const events = watchdogService.getServiceEvents();
      const hangEvent = events.find((e) => e.type === 'hang_detected');
      expect(hangEvent).toBeDefined();
    });

    it('should record hang_detected event with timestamp', () => {
      watchdogService.signalResponsive();
      jest.advanceTimersByTime(11000);

      const beforeCheck = Date.now();
      watchdogService['performHealthCheck']();
      const afterCheck = Date.now();

      const events = watchdogService.getServiceEvents();
      const hangEvent = events.find((e) => e.type === 'hang_detected');

      expect(hangEvent).toBeDefined();
      expect(hangEvent!.timestamp).toBeGreaterThanOrEqual(beforeCheck);
      expect(hangEvent!.timestamp).toBeLessThanOrEqual(afterCheck);
    });

    it('should recover responsiveness with new signal', () => {
      watchdogService.signalResponsive();
      jest.advanceTimersByTime(11000);

      let healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.isResponsive).toBe(false);

      // Signal responsive again
      watchdogService.signalResponsive();

      healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.isResponsive).toBe(true);
    });
  });

  describe('configureThresholds()', () => {
    it('should allow runtime threshold adjustment', () => {
      const newThresholds: Partial<WatchdogThresholds> = {
        hangDetectionThreshold: 20000,
        cpuErrorBound: 90,
      };

      watchdogService.configureThresholds(newThresholds);

      expect(watchdogService['thresholds'].hangDetectionThreshold).toBe(20000);
      expect(watchdogService['thresholds'].cpuErrorBound).toBe(90);
    });

    it('should preserve unmodified thresholds', () => {
      const originalMemoryThreshold = watchdogService['thresholds'].memoryErrorBound;

      watchdogService.configureThresholds({ cpuErrorBound: 85 });

      expect(watchdogService['thresholds'].memoryErrorBound).toBe(originalMemoryThreshold);
    });

    it('should allow multiple threshold adjustments', () => {
      watchdogService.configureThresholds({ cpuErrorBound: 70 });
      watchdogService.configureThresholds({ memoryErrorBound: 600 });

      expect(watchdogService['thresholds'].cpuErrorBound).toBe(70);
      expect(watchdogService['thresholds'].memoryErrorBound).toBe(600);
    });

    it('should update healthCheckInterval when configured', () => {
      watchdogService.configureThresholds({ healthCheckInterval: 10000 });

      expect(watchdogService['thresholds'].healthCheckInterval).toBe(10000);
    });

    it('should apply threshold to hang detection logic', () => {
      watchdogService.configureThresholds({ hangDetectionThreshold: 5000 });
      watchdogService.signalResponsive();

      jest.advanceTimersByTime(5100); // 5.1 seconds

      const healthStatus = watchdogService.getHealthStatus();
      expect(healthStatus.isResponsive).toBe(false); // Hang detected with new threshold
    });

    it('should apply CPU error bound to restart-required emit', () => {
      const restartSpy = jest.fn();
      watchdogService.on('restart-required', restartSpy);

      watchdogService.configureThresholds({ cpuErrorBound: 30 });

      // Mock high CPU (40%)
      (os.loadavg as jest.Mock).mockReturnValue([1.6, 1.0, 0.8]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));

      watchdogService['performHealthCheck']();

      expect(restartSpy).toHaveBeenCalled();
    });

    it('should apply memory error bound to restart-required emit', () => {
      const restartSpy = jest.fn();
      watchdogService.on('restart-required', restartSpy);

      watchdogService.configureThresholds({ memoryErrorBound: 70 }); // 70% threshold

      // Mock high memory (75% used)
      const totalMem = 100;
      const freeMem = 25; // 75% used
      (os.totalmem as jest.Mock).mockReturnValue(totalMem);
      (os.freemem as jest.Mock).mockReturnValue(freeMem);

      watchdogService['performHealthCheck']();

      expect(restartSpy).toHaveBeenCalled();
    });
  });

  describe('Emit restart-required event', () => {
    it('should emit restart-required when CPU exceeds bound', () => {
      const restartSpy = jest.fn();
      watchdogService.on('restart-required', restartSpy);

      // Mock CPU at 85%
      (os.loadavg as jest.Mock).mockReturnValue([3.4, 2.5, 2.0]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));

      watchdogService['performHealthCheck']();

      expect(restartSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cpuPercent: 85,
        })
      );
    });

    it('should emit restart-required when memory exceeds bound', () => {
      const restartSpy = jest.fn();
      watchdogService.on('restart-required', restartSpy);

      // Configure threshold to 60% and mock 75% usage to trigger event
      watchdogService.configureThresholds({ memoryErrorBound: 60 });

      const totalMem = 100;
      const freeMem = 25; // 75% used
      (os.totalmem as jest.Mock).mockReturnValue(totalMem);
      (os.freemem as jest.Mock).mockReturnValue(freeMem);

      watchdogService['performHealthCheck']();

      expect(restartSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryPercent: 75,
        })
      );
    });

    it('should emit event with both CPU and memory data', () => {
      const restartSpy = jest.fn();
      watchdogService.on('restart-required', restartSpy);

      // Mock high CPU and memory
      (os.loadavg as jest.Mock).mockReturnValue([3.5, 3.0, 2.5]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));

      const totalMem = 100;
      const freeMem = 5;
      (os.totalmem as jest.Mock).mockReturnValue(totalMem);
      (os.freemem as jest.Mock).mockReturnValue(freeMem);

      watchdogService['performHealthCheck']();

      expect(restartSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cpuPercent: 87.5,
          memoryPercent: 95,
        })
      );
    });

    it('should not emit restart-required when within limits', () => {
      const restartSpy = jest.fn();
      watchdogService.on('restart-required', restartSpy);

      // Normal CPU and memory
      (os.loadavg as jest.Mock).mockReturnValue([0.5, 0.4, 0.3]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));

      const totalMem = 100;
      const freeMem = 60; // 40% used
      (os.totalmem as jest.Mock).mockReturnValue(totalMem);
      (os.freemem as jest.Mock).mockReturnValue(freeMem);

      watchdogService['performHealthCheck']();

      expect(restartSpy).not.toHaveBeenCalled();
    });

    it('should record restart_required event in service events', () => {
      (os.loadavg as jest.Mock).mockReturnValue([3.4, 2.5, 2.0]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));

      watchdogService['performHealthCheck']();

      const events = watchdogService.getServiceEvents();
      const restartEvent = events.find((e) => e.type === 'restart_required');

      expect(restartEvent).toBeDefined();
      expect(restartEvent!.message).toContain('Resource limits exceeded');
    });

    it('should emit only once per health check even if both thresholds exceeded', () => {
      const restartSpy = jest.fn();
      watchdogService.on('restart-required', restartSpy);

      // High CPU and memory
      (os.loadavg as jest.Mock).mockReturnValue([4.0, 3.0, 2.5]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));

      const totalMem = 100;
      const freeMem = 5;
      (os.totalmem as jest.Mock).mockReturnValue(totalMem);
      (os.freemem as jest.Mock).mockReturnValue(freeMem);

      watchdogService['performHealthCheck']();

      expect(restartSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Health check runs at configured interval', () => {
    it('should run performHealthCheck at healthCheckInterval', () => {
      const healthCheckSpy = jest.spyOn(watchdogService, 'performHealthCheck' as any);

      watchdogService.start();
      jest.advanceTimersByTime(5000); // Default interval is 5000ms

      expect(healthCheckSpy).toHaveBeenCalled();
    });

    it('should run health checks repeatedly', () => {
      const healthCheckSpy = jest.spyOn(watchdogService, 'performHealthCheck' as any);

      watchdogService.start();
      jest.advanceTimersByTime(15000); // 3 intervals

      expect(healthCheckSpy).toHaveBeenCalledTimes(3);
    });

    it('should record health check events', () => {
      watchdogService.start();
      jest.advanceTimersByTime(5000);

      const events = watchdogService.getServiceEvents();
      const healthCheckEvent = events.find((e) => e.type === 'health_check');

      expect(healthCheckEvent).toBeDefined();
      expect(healthCheckEvent!.message).toContain('Health check');
    });

    it('should maintain CPU history during health checks', () => {
      (os.loadavg as jest.Mock).mockReturnValue([1.0, 1.0, 1.0]);
      (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));

      watchdogService.start();
      jest.advanceTimersByTime(15000); // 3 intervals

      expect(watchdogService['cpuHistory'].length).toBe(3);
    });

    it('should maintain memory history during health checks', () => {
      watchdogService.start();
      jest.advanceTimersByTime(15000); // 3 intervals

      expect(watchdogService['memoryHistory'].length).toBe(3);
    });
  });

  describe('getServiceEvents() filtering', () => {
    it('should return all events when no filter provided', () => {
      watchdogService.recordServiceEvent({
        type: 'error',
        message: 'Error 1',
        timestamp: Date.now(),
      });
      watchdogService.recordServiceEvent({
        type: 'recovery',
        message: 'Recovery 1',
        timestamp: Date.now(),
      });

      const events = watchdogService.getServiceEvents();
      expect(events.length).toBe(2);
    });

    it('should filter by event type', () => {
      watchdogService.recordServiceEvent({
        type: 'error',
        message: 'Error 1',
        timestamp: Date.now(),
      });
      watchdogService.recordServiceEvent({
        type: 'recovery',
        message: 'Recovery 1',
        timestamp: Date.now(),
      });
      watchdogService.recordServiceEvent({
        type: 'error',
        message: 'Error 2',
        timestamp: Date.now(),
      });

      const errors = watchdogService.getServiceEvents({ type: 'error' });
      expect(errors.length).toBe(2);
      expect(errors.every((e) => e.type === 'error')).toBe(true);
    });

    it('should filter by service name', () => {
      watchdogService.recordServiceEvent({
        type: 'error',
        service: 'clipboard',
        message: 'Error 1',
        timestamp: Date.now(),
      });
      watchdogService.recordServiceEvent({
        type: 'error',
        service: 'detector',
        message: 'Error 2',
        timestamp: Date.now(),
      });

      const clipboardEvents = watchdogService.getServiceEvents({ service: 'clipboard' });
      expect(clipboardEvents.length).toBe(1);
      expect(clipboardEvents[0].service).toBe('clipboard');
    });

    it('should support combined filter by type and service', () => {
      watchdogService.recordServiceEvent({
        type: 'error',
        service: 'clipboard',
        message: 'Clipboard error',
        timestamp: Date.now(),
      });
      watchdogService.recordServiceEvent({
        type: 'error',
        service: 'detector',
        message: 'Detector error',
        timestamp: Date.now(),
      });
      watchdogService.recordServiceEvent({
        type: 'recovery',
        service: 'clipboard',
        message: 'Clipboard recovery',
        timestamp: Date.now(),
      });

      const filtered = watchdogService.getServiceEvents({
        type: 'error',
        service: 'clipboard',
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].message).toBe('Clipboard error');
    });
  });

  describe('EventEmitter integration', () => {
    it('should extend EventEmitter', () => {
      expect(watchdogService).toBeInstanceOf(require('events').EventEmitter);
    });

    it('should allow event listener registration', () => {
      const listener = jest.fn();
      watchdogService.on('restart-required', listener);

      watchdogService.emit('restart-required', { cpuPercent: 85, memoryPercent: 90 });

      expect(listener).toHaveBeenCalled();
    });

    it('should allow multiple listeners on same event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      watchdogService.on('restart-required', listener1);
      watchdogService.on('restart-required', listener2);

      watchdogService.emit('restart-required', { cpuPercent: 85, memoryPercent: 90 });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });
});
