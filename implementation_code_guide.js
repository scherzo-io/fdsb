// Ferrari Driving School SMS AI Assistant - Implementation Guide
// This is your complete code foundation with detailed explanations

// ===== CORE APPLICATION STRUCTURE =====

// package.json - Your project dependencies
/*
{
  "name": "ferrari-sms-assistant",
  "version": "1.0.0",
  "main": "src/app.js",
  "dependencies": {
    "express": "^4.18.2",           // Web framework for webhook handling
    "redis": "^4.6.7",             // Caching and session management
    "pg": "^8.11.0",               // PostgreSQL database client
    "bull": "^4.11.3",             // Background job processing
    "twilio": "^4.14.0",           // SMS gateway integration
    "axios": "^1.4.0",             // HTTP client for API calls
    "@langchain/core": "^0.2.0",   // LangChain core functionality
    "langgraph": "^0.0.26",        // Conversation orchestration
    "@anthropic-ai/sdk": "^0.20.0", // Claude API integration
    "helmet": "^7.0.0",            // Security middleware
    "rate-limiter-flexible": "^2.4.2", // Rate limiting
    "joi": "^17.9.2",              // Data validation
    "winston": "^3.10.0",          // Logging framework
    "dotenv": "^16.3.1"            // Environment configuration
  }
}
*/

// ===== ENVIRONMENT CONFIGURATION =====
// .env file - Keep your secrets safe
/*
# Core Application
NODE_ENV=production
PORT=3000
APP_SECRET=your-super-secret-app-key

# AI Models
ANTHROPIC_API_KEY=sk-ant-api03-your-claude-key
OPENAI_API_KEY=sk-your-openai-key-for-fallback

# Communication
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Data Storage
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:password@localhost:5432/ferrari_assistant

# Ferrari CRM Integration
FERRARI_CRM_BASE_URL=https://connector.fds.to/api/v1
FERRARI_CRM_API_KEY=your-crm-api-key

# Security
JWT_SECRET=your-jwt-secret-for-sessions
ENCRYPTION_KEY=your-32-character-encryption-key
*/

// ===== MAIN APPLICATION ENTRY POINT =====
// src/app.js - The heart of your application
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('rate-limiter-flexible');
const { createRedisClient } = require('./config/redis');
const { initializeDatabase } = require('./config/database');
const { setupWebhooks } = require('./routes/webhooks');
const { ConversationOrchestrator } = require('./services/orchestrator');
const logger = require('./utils/logger');

class FerrariSMSAssistant {
  constructor() {
    this.app = express();
    this.redis = null;
    this.database = null;
    this.orchestrator = null;
  }

  async initialize() {
    try {
      // Security middleware - protect against common attacks
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
          },
        },
      }));

      // Rate limiting - prevent abuse and spam
      const rateLimiter = new rateLimit.RateLimiterRedis({
        storeClient: await createRedisClient(),
        keyGenerator: (req) => req.body.From || req.ip, // Limit by phone number
        points: 10, // Number of requests
        duration: 60, // Per 60 seconds
        blockDuration: 300, // Block for 5 minutes if exceeded
      });

      this.app.use(async (req, res, next) => {
        try {
          await rateLimiter.consume(req.body.From || req.ip);
          next();
        } catch (rejRes) {
          logger.warn(`Rate limit exceeded for ${req.body.From || req.ip}`);
          res.status(429).send('Too many requests');
        }
      });

      // Body parsing for webhook data
      this.app.use(express.urlencoded({ extended: true }));
      this.app.use(express.json());

      // Initialize core services
      this.redis = await createRedisClient();
      this.database = await initializeDatabase();
      this.orchestrator = new ConversationOrchestrator(this.redis, this.database);

      // Set up webhook routes
      setupWebhooks(this.app, this.orchestrator);

      // Health check endpoint - important for monitoring
      this.app.get('/health', (req, res) => {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            redis: this.redis.isOpen,
            database: this.database.connected,
            orchestrator: this.orchestrator.isReady()
          }
        });
      });

      logger.info('Ferrari SMS Assistant initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      process.exit(1);
    }
  }

  async start() {
    const port = process.env.PORT || 3000;
    this.app.listen(port, () => {
      logger.info(`Ferrari SMS Assistant listening on port ${port}`);
    });
  }
}

// Start the application
const assistant = new FerrariSMSAssistant();
assistant.initialize().then(() => assistant.start());

// ===== CONVERSATION ORCHESTRATOR =====
// src/services/orchestrator.js - The brain of your assistant
const { StateGraph, START, END } = require('langgraph');
const { FerrariCRMClient } = require('./ferrari-crm');
const { ClaudeChat } = require('./ai-models');
const { ConversationState } = require('./state-manager');

class ConversationOrchestrator {
  constructor(redis, database) {
    this.redis = redis;
    this.database = database;
    this.crmClient = new FerrariCRMClient();
    this.aiModel = new ClaudeChat();
    this.stateManager = new ConversationState(redis);
    
    // Build the conversation flow graph
    this.conversationGraph = this.buildConversationFlow();
  }

  buildConversationFlow() {
    // Think of this as a flowchart that the AI follows
    // Each node represents a conversation state, edges represent transitions
    const graph = new StateGraph();

    // Define conversation states (nodes)
    graph.addNode('authenticate', this.authenticateUser.bind(this));
    graph.addNode('classify_intent', this.classifyIntent.bind(this));
    graph.addNode('handle_booking', this.handleBooking.bind(this));
    graph.addNode('handle_info_lookup', this.handleInfoLookup.bind(this));
    graph.addNode('handle_update', this.handleUpdate.bind(this));
    graph.addNode('handle_cancellation', this.handleCancellation.bind(this));
    graph.addNode('handle_reschedule', this.handleReschedule.bind(this));
    graph.addNode('human_handoff', this.humanHandoff.bind(this));
    graph.addNode('generate_response', this.generateResponse.bind(this));

    // Define conversation flow (edges)
    graph.addEdge(START, 'authenticate');
    graph.addEdge('authenticate', 'classify_intent');
    
    // From intent classification, route to appropriate handlers
    graph.addConditionalEdges('classify_intent', this.routeByIntent.bind(this), {
      'book_lesson': 'handle_booking',
      'check_info': 'handle_info_lookup',
      'update_info': 'handle_update',
      'cancel_lesson': 'handle_cancellation',
      'reschedule_lesson': 'handle_reschedule',
      'need_help': 'human_handoff',
      'unknown': 'generate_response'
    });

    // All handlers eventually lead to response generation
    ['handle_booking', 'handle_info_lookup', 'handle_update', 
     'handle_cancellation', 'handle_reschedule', 'human_handoff'].forEach(node => {
      graph.addEdge(node, 'generate_response');
    });

    graph.addEdge('generate_response', END);

    return graph.compile();
  }

  async processMessage(phoneNumber, message) {
    try {
      // Load or create conversation state
      let state = await this.stateManager.getState(phoneNumber);
      if (!state) {
        state = {
          phoneNumber,
          message,
          authenticated: false,
          currentFlow: null,
          studentData: null,
          conversationHistory: [],
          lastActivity: new Date()
        };
      }

      // Add current message to history
      state.conversationHistory.push({
        type: 'user',
        content: message,
        timestamp: new Date()
      });

      // Process through conversation graph
      const result = await this.conversationGraph.invoke(state);
      
      // Save updated state
      await this.stateManager.saveState(phoneNumber, result);
      
      return result.response;
    } catch (error) {
      logger.error(`Error processing message from ${phoneNumber}:`, error);
      return "I'm having trouble right now. Please try again in a moment or call our office at 718-278-6679.";
    }
  }

  async authenticateUser(state) {
    // Check if user is already authenticated in this session
    if (state.authenticated && state.studentData) {
      return state; // Skip authentication
    }

    // Extract license number from message if provided
    const licenseMatch = state.message.match(/\b\d{8,12}\b/);
    
    if (!licenseMatch) {
      state.response = "Hi! To help you with your driving lessons, I'll need your driver's license number. What's your license number?";
      state.waitingFor = 'license_number';
      return state;
    }

    const licenseNumber = licenseMatch[0];
    
    try {
      // Call Ferrari CRM to verify student
      const studentData = await this.crmClient.getStudentInfo(licenseNumber);
      
      if (studentData) {
        state.authenticated = true;
        state.studentData = studentData;
        state.response = `Hi ${studentData.FirstName}! How can I help you today? I can help you book lessons, check your schedule, update your information, or answer questions.`;
      } else {
        state.response = "We couldn't find any information with that license number. Please double-check the number or call our office at 718-278-6679 for help.";
        state.authenticated = false;
      }
    } catch (error) {
      logger.error('Authentication error:', error);
      state.response = "I'm having trouble accessing our student database right now. Please try again in a moment.";
    }

    return state;
  }

  async classifyIntent(state) {
    // Skip if not authenticated
    if (!state.authenticated) {
      return state;
    }

    // Use Claude to understand what the user wants
    const prompt = `
    You are analyzing a message from a driving school student. Classify their intent from these options:
    - book_lesson: They want to schedule a new lesson
    - check_info: They want to see their appointments or personal information  
    - update_info: They want to change their contact details
    - cancel_lesson: They want to cancel an existing lesson
    - reschedule_lesson: They want to change the time/date of an existing lesson
    - need_help: Complex issue requiring human assistance
    - unknown: Intent is unclear

    Student message: "${state.message}"
    
    Respond with just the intent category, nothing else.
    `;

    try {
      const intent = await this.aiModel.classify(prompt);
      state.intent = intent.trim().toLowerCase();
      
      // Log for analytics
      logger.info(`Intent classified: ${state.intent} for message: ${state.message}`);
    } catch (error) {
      logger.error('Intent classification error:', error);
      state.intent = 'unknown';
    }

    return state;
  }

  async handleBooking(state) {
    // This is where the magic happens for lesson booking
    // We'll implement a multi-step booking process
    
    if (!state.bookingData) {
      state.bookingData = {};
    }

    // Step 1: Choose lesson type
    if (!state.bookingData.lessonType) {
      // Get available lesson types from student data
      const availableClasses = state.studentData.availableClasses || [];
      
      if (availableClasses.length === 0) {
        state.response = "I don't see any available lesson types for your account. Please call our office at 718-278-6679 to set up your lessons.";
        return state;
      }

      state.response = `What type of lesson would you like to book?\n\n${availableClasses.map((cls, idx) => `${idx + 1}. ${cls.name}`).join('\n')}\n\nJust reply with the number or name.`;
      state.waitingFor = 'lesson_type';
      return state;
    }

    // Step 2: Choose location
    if (!state.bookingData.location) {
      state.response = "Which location is most convenient for you?\n\n1. Brooklyn - 2444 Linden Blvd\n2. Queens - 3528 19th Ave\n\nReply with 1, 2, Brooklyn, or Queens.";
      state.waitingFor = 'location';
      return state;
    }

    // Step 3: Choose duration
    if (!state.bookingData.duration) {
      state.response = "How long would you like your lesson to be?\n\n1. 1.5 hours\n2. 2 hours\n3. 3 hours\n\nReply with the number or duration.";
      state.waitingFor = 'duration';
      return state;
    }

    // Step 4: Choose date
    if (!state.bookingData.date) {
      state.response = "What date would you prefer for your lesson? Please provide the date in MM/DD/YYYY format (like 07/15/2024).";
      state.waitingFor = 'date';
      return state;
    }

    // Step 5: Show available instructors and times
    if (!state.bookingData.selectedSlot) {
      try {
        // Call Ferrari CRM to get available slots
        const availableSlots = await this.crmClient.getInstructorsOpenSlots({
          lesson: state.bookingData.lessonType,
          date: state.bookingData.date,
          location: state.bookingData.location === 'Brooklyn' ? 'BK' : 'AS',
          duration: parseFloat(state.bookingData.duration)
        });

        if (!availableSlots || availableSlots.length === 0) {
          state.response = `No availability found for ${state.bookingData.date}. Would you like to try a different date? Or I can check our other location.`;
          state.bookingData.date = null; // Reset to ask for date again
          return state;
        }

        // Format available slots for user
        const slotOptions = availableSlots.map((slot, idx) => 
          `${idx + 1}. ${slot.instructorName} - ${slot.startTime} to ${slot.endTime}`
        ).join('\n');

        state.response = `Here are the available time slots for ${state.bookingData.date}:\n\n${slotOptions}\n\nReply with the number of your preferred slot.`;
        state.availableSlots = availableSlots;
        state.waitingFor = 'time_slot';
        return state;
      } catch (error) {
        logger.error('Error fetching available slots:', error);
        state.response = "I'm having trouble checking availability right now. Please try again in a moment.";
        return state;
      }
    }

    // Step 6: Confirm booking
    if (!state.bookingData.confirmed) {
      const selectedSlot = state.availableSlots[parseInt(state.bookingData.selectedSlot) - 1];
      const locationName = state.bookingData.location;
      const locationAddress = locationName === 'Brooklyn' ? '2444 Linden Blvd' : '3528 19th Ave';

      state.response = `Please confirm your booking:\n\n📅 ${state.bookingData.date}\n⏰ ${selectedSlot.startTime} to ${selectedSlot.endTime}\n👨‍🏫 ${selectedSlot.instructorName}\n📍 ${locationName} location (${locationAddress})\n🚗 ${state.bookingData.lessonType}\n⏱️ ${state.bookingData.duration} hours\n\nReply YES to confirm or NO to cancel.`;
      state.waitingFor = 'confirmation';
      state.pendingBooking = selectedSlot;
      return state;
    }

    // Final step: Actually book the lesson
    try {
      const booking = await this.crmClient.bookAppointment({
        motoristId: state.pendingBooking.instructorId,
        classId: state.bookingData.lessonTypeId,
        StudentID: state.studentData.id,
        AppointmentDate: state.bookingData.date,
        StartRow: state.pendingBooking.startTime,
        EndRow: state.pendingBooking.endTime
      });

      state.response = `✅ Your lesson has been successfully booked!\n\n📅 ${state.bookingData.date}\n⏰ ${state.pendingBooking.startTime} to ${state.pendingBooking.endTime}\n👨‍🏫 ${state.pendingBooking.instructorName}\n\nYou'll receive a reminder 24 hours before your lesson. Drive safely!`;
      
      // Clear booking data
      state.bookingData = null;
      state.availableSlots = null;
      state.pendingBooking = null;
      state.waitingFor = null;

    } catch (error) {
      logger.error('Error booking appointment:', error);
      state.response = "I encountered an error while booking your lesson. Please call our office at 718-278-6679 to complete your booking.";
    }

    return state;
  }

  // Additional handler methods would go here...
  // handleInfoLookup, handleUpdate, handleCancellation, etc.
  
  routeByIntent(state) {
    return state.intent || 'unknown';
  }

  async generateResponse(state) {
    // This is called when we need to generate a conversational response
    // that doesn't fit into the structured flows above
    
    if (state.response) {
      return state; // Response already set by a handler
    }

    // Use Claude to generate a helpful response
    const prompt = `
    You are a helpful assistant for Ferrari Driving School in NYC. 
    
    Student: ${state.studentData?.FirstName || 'Student'}
    Message: "${state.message}"
    
    Provide a helpful, friendly response. Keep it conversational and brief.
    If you can't help with their request, politely direct them to call 718-278-6679.
    `;

    try {
      state.response = await this.aiModel.generateResponse(prompt);
    } catch (error) {
      logger.error('Error generating response:', error);
      state.response = "I'm not sure I understand. Could you try rephrasing that? Or call our office at 718-278-6679 for immediate help.";
    }

    return state;
  }
}

// ===== FERRARI CRM CLIENT =====
// src/services/ferrari-crm.js - Your bridge to the CRM system
const axios = require('axios');

class FerrariCRMClient {
  constructor() {
    this.baseURL = process.env.FERRARI_CRM_BASE_URL;
    this.apiKey = process.env.FERRARI_CRM_API_KEY;
    
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000, // 10 second timeout
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        logger.error('CRM API Error:', {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data
        });
        throw error;
      }
    );
  }

  async getStudentInfo(licenseNumber) {
    try {
      const response = await this.client.post('/getStudentInfo', {
        id: licenseNumber
      });
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null; // Student not found
      }
      throw error;
    }
  }

  async getStudentBookedAppointments(licenseNumber) {
    try {
      const response = await this.client.post('/getStudentBookedAppointments', {
        id: licenseNumber
      });
      
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getInstructorsOpenSlots({ lesson, date, location, duration }) {
    try {
      const response = await this.client.post('/getInstructorsOpenSlots', {
        lesson,
        date,
        location,
        duration
      });
      
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async bookAppointment(appointmentData) {
    try {
      const response = await this.client.post('/bookAppointment', appointmentData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async cancelAppointment({ StudentID, SysID, CancelReason, ModReason = "Requested by student", Charge = "N" }) {
    try {
      const response = await this.client.post('/cancelAppointment', {
        StudentID,
        SysID,
        CancelReason,
        ModReason,
        Charge
      });
      
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Add other CRM methods as needed...
}

// ===== AI MODEL INTEGRATION =====
// src/services/ai-models.js - Your AI brain
const { Anthropic } = require('@anthropic-ai/sdk');

class ClaudeChat {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async classify(prompt) {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return response.content[0].text;
    } catch (error) {
      logger.error('Claude classification error:', error);
      throw error;
    }
  }

  async generateResponse(prompt) {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return response.content[0].text;
    } catch (error) {
      logger.error('Claude response generation error:', error);
      throw error;
    }
  }
}

// ===== WEBHOOK HANDLERS =====
// src/routes/webhooks.js - Where Twilio talks to your app
const twilio = require('twilio');

function setupWebhooks(app, orchestrator) {
  // Twilio webhook validation middleware
  const validateTwilioWebhook = twilio.webhook(process.env.TWILIO_AUTH_TOKEN);

  app.post('/webhook/sms', validateTwilioWebhook, async (req, res) => {
    try {
      const { From: phoneNumber, Body: message } = req.body;
      
      logger.info(`Received SMS from ${phoneNumber}: ${message}`);

      // Process the message through our orchestrator
      const response = await orchestrator.processMessage(phoneNumber, message);

      // Send response back via Twilio
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(response);

      res.type('text/xml').send(twiml.toString());
      
      logger.info(`Sent response to ${phoneNumber}: ${response}`);
    } catch (error) {
      logger.error('Webhook error:', error);
      
      // Send error response
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message("I'm having trouble right now. Please try again in a moment or call 718-278-6679.");
      
      res.type('text/xml').send(twiml.toString());
    }
  });

  // Status callback webhook for message delivery tracking
  app.post('/webhook/sms-status', (req, res) => {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;
    
    logger.info(`Message ${MessageSid} status: ${MessageStatus}${ErrorCode ? ` (Error: ${ErrorCode})` : ''}`);
    
    // You could store this in your database for analytics
    
    res.sendStatus(200);
  });
}

module.exports = { setupWebhooks };

// ===== DEPLOYMENT CONFIGURATION =====
// railway.json - For Railway deployment
/*
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
*/

// Dockerfile - Alternative containerized deployment
/*
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["npm", "start"]
*/