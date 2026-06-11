import { ipcMain } from 'electron';
import { ErrorHandler } from '../services/error-handler';
import WatchdogService from '../services/watchdog-service';
import { LoggerService } from '../services/logger-service';
import { ClipboardService } from '../services/clipboard-service';
import { DetectorService } from '../services/detector-service';
import { StorageService } from '../services/storage-service';

export function setupHealthHandlers(
  errorHandler: ErrorHandler,
  watchdog: WatchdogService,
  logger: LoggerService,
  _clipboardService: ClipboardService,
  _detectorService: DetectorService,
  storageService: StorageService,
): void {
  // Get current health status
  ipcMain.handle('health:get-status', () => {
    const health = watchdog.getHealthStatus();
    const recovery = errorHandler.getErrorSummary();

    return {
      cpu: health.cpu,
      memory: health.memory,
      isResponsive: health.isResponsive,
      uptime: health.uptime,
      detectorLatency: health.detectorLatency,
      services: {
        clipboard: {
          active: health.clipboardServiceActive,
          errors: health.clipboardServiceErrors,
        },
        detector: {
          latency: health.detectorLatency,
        },
        storage: {
          historyCount: storageService.getDetectionHistory().length,
        },
      },
      errors: {
        criticalCount: recovery.criticalErrorCount,
        disabledFeatures: recovery.disabledFeatures,
        canRecover: recovery.canRecover,
      },
      timestamp: health.lastCheck,
    };
  });

  // Get recovery history for debugging
  ipcMain.handle('health:get-recovery-history', () => {
    return errorHandler.getRecoveryHistory();
  });

  // Get watchdog diagnostics
  ipcMain.handle('health:get-diagnostics', () => {
    return watchdog.getDiagnosticSummary();
  });

  // Attempt to restart a service
  ipcMain.handle('health:restart-service', async (_event, serviceName: string) => {
    try {
      logger.info(`Attempting to restart service: ${serviceName}`);

      if (serviceName === 'clipboard') {
        // TODO: Implement service restart logic
        return { success: true, message: 'Clipboard service restart initiated' };
      } else if (serviceName === 'detector') {
        // TODO: Implement detector restart
        return { success: true, message: 'Detector service restart initiated' };
      } else {
        return { success: false, message: `Unknown service: ${serviceName}` };
      }
    } catch (error) {
      logger.error(`Failed to restart service: ${serviceName}`, error instanceof Error ? error : new Error(String(error)));
      return { success: false, message: 'Restart failed' };
    }
  });

  // Report service-level error
  ipcMain.on('health:report-error', (_event, { service, severity, message, context }) => {
    logger.error(`Service error reported: ${service}`, new Error(message), {
      service,
      severity,
      context,
    });

    if (severity === 'critical') {
      errorHandler.disableFeature(service, `Critical error: ${message}`);
    }
  });

  // Get feature status
  ipcMain.handle('health:get-features', () => {
    const summary = errorHandler.getErrorSummary();
    return {
      disabled: summary.disabledFeatures,
      critical: summary.criticalErrorCount,
    };
  });

  // Clear recovery history
  ipcMain.handle('health:clear-recovery-history', () => {
    errorHandler.clearRecoveryHistory();
    return { success: true };
  });

  logger.info('Health monitoring IPC handlers registered');
}
