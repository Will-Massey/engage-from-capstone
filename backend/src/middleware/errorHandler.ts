import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import logger from '../config/logger.js';

// Custom API Error
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Error response type
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Global error handler
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = (req as any).requestId || 'unknown';
  const contextLogger = logger.child({ requestId, tenantId: req.tenantId });

  // Default error response
  let statusCode = 500;
  let response: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };

  // Handle specific error types
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    response = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    contextLogger.warn(`API Error: ${err.code}`, { statusCode, message: err.message });
  } else if (err instanceof ZodError) {
    // Validation error
    statusCode = 400;
    const details: Record<string, string[]> = {};
    
    err.errors.forEach((error) => {
      const path = error.path.join('.');
      if (!details[path]) {
        details[path] = [];
      }
      details[path].push(error.message);
    });

    response = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    };
    contextLogger.warn('Validation error', { details });
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Database errors
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        response = {
          success: false,
          error: {
            code: 'DUPLICATE_ERROR',
            message: 'A record with this value already exists',
          },
        };
        break;
      case 'P2025':
        statusCode = 404;
        response = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Record not found',
          },
        };
        break;
      case 'P2003':
        statusCode = 400;
        response = {
          success: false,
          error: {
            code: 'FOREIGN_KEY_ERROR',
            message: 'Related record does not exist',
          },
        };
        break;
      default:
        contextLogger.error('Database error', { code: err.code, message: err.message });
    }
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    response = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: err.message || 'Authentication required',
      },
    };
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    response = {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: err.message || 'Access denied',
      },
    };
  } else {
    // Unknown error - log full details
    contextLogger.error('Unexpected error', {
      error: err.message,
      stack: err.stack,
    });
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    response.error.message = 'An unexpected error occurred';
  }

  res.status(statusCode).json(response);
};

// Not found handler
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

// Async handler wrapper
// Type for async route handlers
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default { errorHandler, notFoundHandler, asyncHandler, ApiError };
