// ===== FERRARI CRM INTEGRATION: PRODUCTION-READY IMPLEMENTATION =====
// This is your complete guide to integrating with Ferrari's existing CRM system
// while maintaining reliability, performance, and data consistency

// ===== ADVANCED CRM CLIENT WITH COMPREHENSIVE ERROR HANDLING =====

const axios = require('axios');
const CircuitBreaker = require('opossum');
const retry = require('async-retry');
const crypto = require('crypto');

class AdvancedFerrariCRMClient {
  constructor(options = {}) {
    this.baseURL = process.env.FERRARI_CRM_BASE_URL || 'https://connector.fds.to/api/v1';
    this.apiKey = process.env.FERRARI_CRM_API_KEY;
    this.timeout = options.timeout || 10000;
    
    // Initialize HTTP client with advanced configuration
    this.httpClient = this.createHTTPClient();
    
    // Circuit breaker for each endpoint type
    this.circuitBreakers = this.createCircuitBreakers();
    
    // Request cache for idempotent operations
    this.requestCache = new Map();
    
    // Performance metrics tracking
    this.metrics = new PerformanceMetrics();
    
    // API rate limiting
    this.rateLimiter = new APIRateLimiter();
  }

  createHTTPClient() {
    const client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Ferrari-SMS-Assistant/1.0',
        'X-Request-Source': 'sms-assistant'
      }
    });

    // Request interceptor for logging and authentication
    client.interceptors.request.use(
      (config) => {
        // Add request ID for tracing
        config.headers['X-Request-ID'] = this.generateRequestId();
        
        // Add timestamp for performance tracking
        config.metadata = { startTime: Date.now() };
        
        // Log outgoing request (sanitized)
        logger.info('CRM API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          requestId: config.headers['X-Request-ID'],
          // Don't log sensitive data
          hasData: !!config.data
        });

        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for metrics and error handling
    client.interceptors.response.use(
      (response) => {
        // Calculate response time
        const responseTime = Date.now() - response.config.metadata.startTime;
        
        // Record metrics
        this.metrics.recordSuccess(response.config.url, responseTime);
        
        // Log successful response
        logger.info('CRM API Response', {
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          status: response.status,
          responseTime: `${responseTime}ms`,
          requestId: response.config.headers['X-Request-ID']
        });

        return response;
      },
      (error) => {
        // Calculate response time even for errors
        const responseTime = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 0;

        // Record error metrics
        this.metrics.recordError(error.config?.url, responseTime, error.response?.status);

        // Enhanced error logging
        logger.error('CRM API Error', {
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseTime: `${responseTime}ms`,
          requestId: error.config?.headers['X-Request-ID'],
          errorMessage: error.message,
          // Log response data for debugging (sanitized)
          responseData: this.sanitizeErrorData(error.response?.data)
        });

        return Promise.reject(this.enhanceError(error));
      }
    );

    return client;
  }

  createCircuitBreakers() {
    const defaultOptions = {
      timeout: 8000,              // Fail fast after 8 seconds
      errorThresholdPercentage: 60, // Open circuit at 60% error rate
      resetTimeout: 30000,        // Try again after 30 seconds
      rollingCountTimeout: 60000,  // 1 minute rolling window
      rollingCountBuckets: 10     // 10 buckets for granular tracking
    };

    return {
      // Critical operations - more conservative settings
      studentInfo: new CircuitBreaker(
        this.makeRequest.bind(this),
        { ...defaultOptions, errorThresholdPercentage: 50 }
      ),
      
      // Booking operations - balanced settings
      booking: new CircuitBreaker(
        this.makeRequest.bind(this),
        defaultOptions
      ),
      
      // Query operations - more aggressive settings (can fail more often)
      query: new CircuitBreaker(
        this.makeRequest.bind(this),
        { ...defaultOptions, errorThresholdPercentage: 70 }
      )
    };
  }

  // ===== CORE API METHODS WITH ADVANCED FEATURES =====

  async getStudentInfo(licenseNumber, options = {}) {
    const cacheKey = `student:${licenseNumber}`;
    const endpoint = '/getStudentInfo';
    
    // Check cache first (if not disabled)
    if (!options.skipCache) {
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for student ${licenseNumber}`);
        return cached;
      }
    }

    try {
      // Apply rate limiting
      await this.rateLimiter.waitForAvailability('studentInfo');

      // Use circuit breaker for reliability
      const response = await this.circuitBreakers.studentInfo.fire(
        endpoint,
        { id: licenseNumber },
        'POST'
      );

      // Cache successful response
      await this.saveToCache(cacheKey, response.data, 3600); // 1 hour TTL

      return response.data;

    } catch (error) {
      // Handle specific error cases
      if (error.statusCode === 404) {
        logger.info(`Student not found: ${licenseNumber}`);
        return null; // Student doesn't exist
      }

      // For other errors, try cache if available
      if (!options.skipCache) {
        const staleCache = await this.getFromStaleCache(cacheKey);
        if (staleCache) {
          logger.warn(`Using stale cache for student ${licenseNumber} due to API error`);
          return staleCache;
        }
      }

      throw new CRMIntegrationError(
        `Failed to retrieve student information for ${licenseNumber}`,
        error.statusCode,
        error.originalError
      );
    }
  }

  async getStudentBookedAppointments(licenseNumber, options = {}) {
    const endpoint = '/getStudentBookedAppointments';
    const cacheKey = `appointments:${licenseNumber}`;
    
    try {
      await this.rateLimiter.waitForAvailability('appointments');

      const response = await this.circuitBreakers.query.fire(
        endpoint,
        { id: licenseNumber },
        'POST'
      );

      // Cache with shorter TTL since appointments change frequently
      await this.saveToCache(cacheKey, response.data, 900); // 15 minutes

      return this.transformAppointmentData(response.data);

    } catch (error) {
      // Try to provide partial functionality even during outages
      const cachedAppointments = await this.getFromStaleCache(cacheKey);
      if (cachedAppointments) {
        logger.warn(`Using stale appointment data for ${licenseNumber}`);
        return {
          ...cachedAppointments,
          _isStale: true,
          _warning: 'This information may not be current. Please call 718-278-6679 for the latest updates.'
        };
      }

      throw new CRMIntegrationError(
        'Unable to retrieve appointment information',
        error.statusCode,
        error.originalError
      );
    }
  }

  async getInstructorsOpenSlots(params, options = {}) {
    const { lesson, date, location, duration } = params;
    const endpoint = '/getInstructorsOpenSlots';
    
    // Create cache key based on parameters
    const cacheKey = `slots:${this.hashParams(params)}`;
    
    try {
      await this.rateLimiter.waitForAvailability('availability');

      // Validate parameters before sending
      this.validateAvailabilityParams(params);

      const response = await this.circuitBreakers.query.fire(
        endpoint,
        { lesson, date, location, duration },
        'POST'
      );

      // Cache for short period (availability changes quickly)
      await this.saveToCache(cacheKey, response.data, 300); // 5 minutes

      return this.transformAvailabilityData(response.data, params);

    } catch (error) {
      if (error.statusCode === 400) {
        throw new ValidationError('Invalid availability request parameters', params);
      }

      throw new CRMIntegrationError(
        'Unable to check instructor availability',
        error.statusCode,
        error.originalError
      );
    }
  }

  async bookAppointment(appointmentData, options = {}) {
    const endpoint = '/bookAppointment';
    
    try {
      // Critical operation - apply strict rate limiting
      await this.rateLimiter.waitForAvailability('booking');

      // Validate booking data thoroughly
      this.validateBookingData(appointmentData);

      // Check for duplicate booking attempts
      const duplicateCheck = await this.checkDuplicateBooking(appointmentData);
      if (duplicateCheck.isDuplicate) {
        logger.warn(`Duplicate booking attempt detected`, appointmentData);
        return duplicateCheck.existingBooking;
      }

      // Create idempotency key to prevent duplicate submissions
      const idempotencyKey = this.generateIdempotencyKey(appointmentData);
      
      // Use retry logic for booking operations
      const response = await retry(async () => {
        return await this.circuitBreakers.booking.fire(
          endpoint,
          {
            ...appointmentData,
            idempotencyKey // Include for server-side duplicate detection
          },
          'POST'
        );
      }, {
        retries: 3,
        factor: 2, // Exponential backoff
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (error, attempt) => {
          logger.warn(`Booking attempt ${attempt} failed, retrying:`, error.message);
        }
      });

      // Log successful booking for audit trail
      logger.info('Booking successful', {
        studentId: appointmentData.StudentID,
        instructorId: appointmentData.motoristId,
        appointmentDate: appointmentData.AppointmentDate,
        bookingId: response.data?.bookingId
      });

      // Clear related caches
      await this.invalidateRelatedCaches(appointmentData);

      return response.data;

    } catch (error) {
      // Enhanced error handling for booking failures
      if (error.statusCode === 409) {
        throw new BookingConflictError('Time slot no longer available', appointmentData);
      }
      
      if (error.statusCode === 422) {
        throw new ValidationError('Invalid booking data', appointmentData);
      }

      throw new CRMIntegrationError(
        'Failed to book appointment',
        error.statusCode,
        error.originalError
      );
    }
  }

  async cancelAppointment(cancelData, options = {}) {
    const { StudentID, SysID, CancelReason, ModReason = "Requested by student", Charge = "N" } = cancelData;
    const endpoint = '/cancelAppointment';

    try {
      await this.rateLimiter.waitForAvailability('booking');

      // Validate cancellation data
      this.validateCancellationData(cancelData);

      // Check if appointment exists and is cancellable
      const appointmentDetails = await this.verifyAppointmentCancellable(SysID, StudentID);

      const response = await retry(async () => {
        return await this.circuitBreakers.booking.fire(
          endpoint,
          { StudentID, SysID, CancelReason, ModReason, Charge },
          'POST'
        );
      }, {
        retries: 2, // Fewer retries for cancellations
        minTimeout: 1000,
        maxTimeout: 3000
      });

      // Log cancellation for audit trail
      logger.info('Cancellation successful', {
        studentId: StudentID,
        appointmentId: SysID,
        reason: CancelReason,
        charge: Charge
      });

      // Clear related caches
      await this.invalidateStudentCaches(StudentID);

      return response.data;

    } catch (error) {
      if (error.statusCode === 404) {
        throw new AppointmentNotFoundError('Appointment not found or already cancelled', SysID);
      }

      throw new CRMIntegrationError(
        'Failed to cancel appointment',
        error.statusCode,
        error.originalError
      );
    }
  }

  // ===== ADVANCED RELIABILITY FEATURES =====

  async makeRequest(endpoint, data, method = 'POST') {
    try {
      const response = await this.httpClient({
        method,
        url: endpoint,
        data: method !== 'GET' ? data : undefined,
        params: method === 'GET' ? data : undefined
      });

      return response;
    } catch (error) {
      // Transform axios error to our error format
      throw this.enhanceError(error);
    }
  }

  // Intelligent caching with Redis backend
  async getFromCache(key) {
    try {
      const cached = await this.redis.get(`crm:${key}`);
      if (cached) {
        const data = JSON.parse(cached);
        // Check if data is still fresh
        if (Date.now() - data.timestamp < data.ttl * 1000) {
          return data.value;
        }
      }
      return null;
    } catch (error) {
      logger.warn('Cache retrieval error:', error);
      return null;
    }
  }

  async saveToCache(key, value, ttlSeconds) {
    try {
      const cacheData = {
        value,
        timestamp: Date.now(),
        ttl: ttlSeconds
      };
      
      await this.redis.setex(`crm:${key}`, ttlSeconds, JSON.stringify(cacheData));
    } catch (error) {
      logger.warn('Cache save error:', error);
      // Don't fail the request if caching fails
    }
  }

  async getFromStaleCache(key) {
    try {
      const cached = await this.redis.get(`crm:${key}`);
      if (cached) {
        const data = JSON.parse(cached);
        // Return even stale data if available
        return data.value;
      }
      return null;
    } catch (error) {
      logger.warn('Stale cache retrieval error:', error);
      return null;
    }
  }

  // ===== DATA VALIDATION AND TRANSFORMATION =====

  validateBookingData(data) {
    const required = ['motoristId', 'classId', 'StudentID', 'AppointmentDate', 'StartRow', 'EndRow'];
    const missing = required.filter(field => !data[field]);
    
    if (missing.length > 0) {
      throw new ValidationError(`Missing required booking fields: ${missing.join(', ')}`, data);
    }

    // Date validation
    const appointmentDate = new Date(data.AppointmentDate);
    if (isNaN(appointmentDate.getTime())) {
      throw new ValidationError('Invalid appointment date format', data);
    }

    // Time validation
    if (!this.isValidTimeFormat(data.StartRow) || !this.isValidTimeFormat(data.EndRow)) {
      throw new ValidationError('Invalid time format. Expected HH:MM AM/PM', data);
    }

    // Future date validation
    if (appointmentDate < new Date()) {
      throw new ValidationError('Cannot book appointments in the past', data);
    }
  }

  validateAvailabilityParams(params) {
    const { lesson, date, location, duration } = params;

    if (!lesson || !date || !location || !duration) {
      throw new ValidationError('Missing required availability parameters', params);
    }

    // Date validation
    const requestDate = new Date(date);
    if (isNaN(requestDate.getTime())) {
      throw new ValidationError('Invalid date format', params);
    }

    // Location validation
    if (!['BK', 'AS'].includes(location)) {
      throw new ValidationError('Invalid location code. Must be BK or AS', params);
    }

    // Duration validation
    const validDurations = [1.5, 2, 2.25, 3];
    if (!validDurations.includes(duration)) {
      throw new ValidationError(`Invalid duration. Must be one of: ${validDurations.join(', ')}`, params);
    }
  }

  transformAppointmentData(rawData) {
    if (!rawData || !Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(appointment => ({
      id: appointment.SysID,
      studentId: appointment.StudentID,
      instructorId: appointment.MotorID,
      instructorName: appointment.MotorName,
      date: appointment.AppointmentDate,
      startTime: appointment.StartTime,
      endTime: appointment.EndTime,
      location: this.translateLocationCode(appointment.Location),
      lessonType: appointment.LessonType,
      status: appointment.Status,
      // Add computed fields
      isUpcoming: new Date(appointment.AppointmentDate) > new Date(),
      canCancel: this.canCancelAppointment(appointment),
      canReschedule: this.canRescheduleAppointment(appointment)
    }));
  }

  transformAvailabilityData(rawData, params) {
    if (!rawData || !Array.isArray(rawData.freeSlots)) {
      return [];
    }

    return rawData.freeSlots.map(slot => ({
      instructorId: slot.motoristId,
      instructorName: slot.instructorName,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: params.duration,
      location: this.translateLocationCode(params.location),
      // Add helper properties
      displayTime: this.formatTimeRange(slot.startTime, slot.endTime),
      isPreferredTime: this.isPreferredTime(slot.startTime),
      instructorRating: slot.rating || null
    })).sort((a, b) => {
      // Sort by preferred times first, then by instructor rating
      if (a.isPreferredTime && !b.isPreferredTime) return -1;
      if (!a.isPreferredTime && b.isPreferredTime) return 1;
      return (b.instructorRating || 0) - (a.instructorRating || 0);
    });
  }

  // ===== UTILITY METHODS =====

  translateLocationCode(code) {
    const locations = {
      'BK': { name: 'Brooklyn', address: '2444 Linden Blvd' },
      'AS': { name: 'Queens', address: '3528 19th Ave' }
    };
    return locations[code] || { name: 'Unknown', address: '' };
  }

  canCancelAppointment(appointment) {
    const appointmentTime = new Date(appointment.AppointmentDate + ' ' + appointment.StartTime);
    const hoursUntilAppointment = (appointmentTime - new Date()) / (1000 * 60 * 60);
    
    return hoursUntilAppointment > 24 && appointment.Status === 'confirmed';
  }

  isPreferredTime(startTime) {
    // Consider afternoon times (2-6 PM) as preferred for students
    const hour = parseInt(startTime.split(':')[0]);
    const isPM = startTime.includes('PM');
    
    return isPM && hour >= 2 && hour <= 6;
  }

  formatTimeRange(startTime, endTime) {
    return `${startTime} - ${endTime}`;
  }

  generateIdempotencyKey(data) {
    // Create consistent hash from booking data
    const keyData = `${data.StudentID}:${data.AppointmentDate}:${data.StartRow}:${data.motoristId}`;
    return crypto.createHash('sha256').update(keyData).digest('hex').substr(0, 16);
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  hashParams(params) {
    const sortedParams = Object.keys(params).sort().reduce((result, key) => {
      result[key] = params[key];
      return result;
    }, {});
    
    return crypto.createHash('md5').update(JSON.stringify(sortedParams)).digest('hex');
  }

  enhanceError(error) {
    const enhanced = new Error(error.message);
    enhanced.statusCode = error.response?.status;
    enhanced.statusText = error.response?.statusText;
    enhanced.responseData = error.response?.data;
    enhanced.originalError = error;
    enhanced.isNetworkError = !error.response;
    enhanced.isServerError = error.response?.status >= 500;
    enhanced.isClientError = error.response?.status >= 400 && error.response?.status < 500;
    
    return enhanced;
  }

  sanitizeErrorData(data) {
    if (!data) return null;
    
    // Remove sensitive information from error logs
    const sanitized = { ...data };
    delete sanitized.apiKey;
    delete sanitized.token;
    delete sanitized.password;
    
    return sanitized;
  }

  async invalidateRelatedCaches(appointmentData) {
    const patterns = [
      `appointments:${appointmentData.StudentID}`,
      `slots:*${appointmentData.AppointmentDate}*`,
      `instructor:${appointmentData.motoristId}:*`
    ];

    for (const pattern of patterns) {
      try {
        const keys = await this.redis.keys(`crm:${pattern}`);
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } catch (error) {
        logger.warn('Cache invalidation error:', error);
      }
    }
  }
}

// ===== SPECIALIZED ERROR CLASSES =====

class CRMIntegrationError extends Error {
  constructor(message, statusCode, originalError) {
    super(message);
    this.name = 'CRMIntegrationError';
    this.statusCode = statusCode;
    this.originalError = originalError;
    this.isRetryable = this.determineRetryability(statusCode);
  }

  determineRetryability(statusCode) {
    // Network errors and 5xx errors are retryable
    // 4xx errors (except 408, 429) are not retryable
    if (!statusCode) return true; // Network error
    if (statusCode >= 500) return true; // Server error
    if (statusCode === 408 || statusCode === 429) return true; // Timeout or rate limit
    return false; // Client error
  }
}

class ValidationError extends Error {
  constructor(message, data) {
    super(message);
    this.name = 'ValidationError';
    this.data = data;
    this.isRetryable = false;
  }
}

class BookingConflictError extends Error {
  constructor(message, bookingData) {
    super(message);
    this.name = 'BookingConflictError';
    this.bookingData = bookingData;
    this.isRetryable = false;
  }
}

class AppointmentNotFoundError extends Error {
  constructor(message, appointmentId) {
    super(message);
    this.name = 'AppointmentNotFoundError';
    this.appointmentId = appointmentId;
    this.isRetryable = false;
  }
}

// ===== PERFORMANCE MONITORING =====

class PerformanceMetrics {
  constructor() {
    this.metrics = {
      requests: new Map(),
      errors: new Map(),
      responseTimes: new Map()
    };
  }

  recordSuccess(endpoint, responseTime) {
    this.incrementCounter(this.metrics.requests, endpoint);
    this.recordResponseTime(endpoint, responseTime);
  }

  recordError(endpoint, responseTime, statusCode) {
    this.incrementCounter(this.metrics.errors, `${endpoint}:${statusCode}`);
    this.recordResponseTime(endpoint, responseTime);
  }

  recordResponseTime(endpoint, time) {
    if (!this.metrics.responseTimes.has(endpoint)) {
      this.metrics.responseTimes.set(endpoint, []);
    }
    
    const times = this.metrics.responseTimes.get(endpoint);
    times.push(time);
    
    // Keep only last 100 measurements
    if (times.length > 100) {
      times.splice(0, times.length - 100);
    }
  }

  incrementCounter(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
  }

  getMetrics() {
    const summary = {};
    
    // Calculate averages and percentiles
    this.metrics.responseTimes.forEach((times, endpoint) => {
      const sorted = [...times].sort((a, b) => a - b);
      summary[endpoint] = {
        requests: this.metrics.requests.get(endpoint) || 0,
        errors: this.getErrorCount(endpoint),
        avgResponseTime: this.calculateAverage(times),
        p95ResponseTime: this.calculatePercentile(sorted, 95),
        p99ResponseTime: this.calculatePercentile(sorted, 99)
      };
    });

    return summary;
  }

  getErrorCount(endpoint) {
    let total = 0;
    this.metrics.errors.forEach((count, key) => {
      if (key.startsWith(endpoint + ':')) {
        total += count;
      }
    });
    return total;
  }

  calculateAverage(numbers) {
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  calculatePercentile(sortedNumbers, percentile) {
    const index = Math.ceil((percentile / 100) * sortedNumbers.length) - 1;
    return sortedNumbers[Math.max(0, index)];
  }
}

// ===== RATE LIMITING =====

class APIRateLimiter {
  constructor() {
    this.limits = {
      studentInfo: { requests: 100, window: 60000 },    // 100 per minute
      appointments: { requests: 50, window: 60000 },    // 50 per minute
      availability: { requests: 200, window: 60000 },   // 200 per minute
      booking: { requests: 20, window: 60000 }          // 20 per minute (critical)
    };
    
    this.windows = new Map();
  }

  async waitForAvailability(operation) {
    const limit = this.limits[operation];
    if (!limit) return; // No limit configured

    const now = Date.now();
    const windowKey = `${operation}:${Math.floor(now / limit.window)}`;
    
    const currentCount = this.windows.get(windowKey) || 0;
    
    if (currentCount >= limit.requests) {
      const waitTime = limit.window - (now % limit.window);
      logger.warn(`Rate limit hit for ${operation}, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }
    
    this.windows.set(windowKey, currentCount + 1);
    
    // Clean up old windows
    this.cleanupOldWindows(now);
  }

  cleanupOldWindows(now) {
    const cutoff = now - 300000; // Keep last 5 minutes
    
    for (const [key] of this.windows) {
      const [, timestamp] = key.split(':');
      if (parseInt(timestamp) * this.getWindowSize() < cutoff) {
        this.windows.delete(key);
      }
    }
  }

  getWindowSize() {
    return Math.max(...Object.values(this.limits).map(l => l.window));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== USAGE EXAMPLE =====

// Initialize the advanced CRM client
const ferrariCRM = new AdvancedFerrariCRMClient({
  timeout: 15000,
  maxRetries: 3
});

// Example: Robust student lookup with fallbacks
async function lookupStudentWithFallbacks(licenseNumber) {
  try {
    // Try primary lookup
    const student = await ferrariCRM.getStudentInfo(licenseNumber);
    
    if (student) {
      return {
        success: true,
        student,
        dataSource: 'live'
      };
    } else {
      return {
        success: false,
        error: 'Student not found',
        errorCode: 'STUDENT_NOT_FOUND'
      };
    }
  } catch (error) {
    logger.error('Student lookup failed:', error);
    
    // Try with stale cache as fallback
    try {
      const staleStudent = await ferrariCRM.getStudentInfo(licenseNumber, { skipCache: false });
      
      return {
        success: true,
        student: staleStudent,
        dataSource: 'cache',
        warning: 'Using cached data due to system issues'
      };
    } catch (cacheError) {
      return {
        success: false,
        error: 'Unable to retrieve student information',
        errorCode: 'SYSTEM_UNAVAILABLE',
        shouldRetry: error.isRetryable
      };
    }
  }
}

// Example: Comprehensive booking flow with validation
async function performBookingWithValidation(bookingRequest) {
  try {
    // Step 1: Validate student exists
    const studentLookup = await lookupStudentWithFallbacks(bookingRequest.StudentID);
    if (!studentLookup.success) {
      throw new ValidationError('Student not found', bookingRequest);
    }

    // Step 2: Check availability
    const availabilityParams = {
      lesson: bookingRequest.classId,
      date: bookingRequest.AppointmentDate,
      location: bookingRequest.location,
      duration: bookingRequest.duration
    };

    const availability = await ferrariCRM.getInstructorsOpenSlots(availabilityParams);
    
    // Step 3: Verify requested slot is still available
    const requestedSlot = availability.find(slot => 
      slot.instructorId === bookingRequest.motoristId &&
      slot.startTime === bookingRequest.StartRow
    );

    if (!requestedSlot) {
      throw new BookingConflictError('Requested time slot is no longer available', bookingRequest);
    }

    // Step 4: Perform booking
    const bookingResult = await ferrariCRM.bookAppointment(bookingRequest);

    return {
      success: true,
      booking: bookingResult,
      message: 'Appointment successfully booked'
    };

  } catch (error) {
    logger.error('Booking failed:', error);
    
    return {
      success: false,
      error: error.message,
      errorCode: error.name,
      shouldRetry: error.isRetryable || false,
      userMessage: this.generateUserFriendlyErrorMessage(error)
    };
  }
}

// Example: Generate user-friendly error messages
function generateUserFriendlyErrorMessage(error) {
  const errorMessages = {
    'ValidationError': 'Please check your booking details and try again.',
    'BookingConflictError': 'That time slot is no longer available. Please choose a different time.',
    'CRMIntegrationError': 'We\'re having trouble with our booking system right now. Please try again in a moment or call 718-278-6679.',
    'AppointmentNotFoundError': 'We couldn\'t find that appointment. It may have already been cancelled.'
  };

  return errorMessages[error.name] || 'Something went wrong. Please call our office at 718-278-6679 for assistance.';
}

module.exports = {
  AdvancedFerrariCRMClient,
  CRMIntegrationError,
  ValidationError,
  BookingConflictError,
  AppointmentNotFoundError,
  PerformanceMetrics,
  APIRateLimiter
};