// ===== ADVANCED PROMPT ENGINEERING SYSTEM =====
// This system creates dynamic, context-aware prompts that adapt to each student's
// communication style, emotional state, and conversation history

class AdvancedPromptEngine {
  constructor() {
    this.studentProfiles = new StudentCommunicationProfiler();
    this.contextAnalyzer = new ConversationContextAnalyzer();
    this.promptTemplates = new DynamicPromptTemplates();
    this.toneAdapter = new ToneAdaptationEngine();
  }

  // ===== MULTI-LAYERED PROMPT CONSTRUCTION =====
  
  async generateContextualPrompt(studentMessage, conversationHistory, studentData) {
    // Layer 1: Analyze student communication profile
    const communicationProfile = await this.studentProfiles.analyze(
      studentMessage, 
      conversationHistory, 
      studentData
    );

    // Layer 2: Assess conversation context and emotional state
    const contextAnalysis = await this.contextAnalyzer.analyze(
      studentMessage,
      conversationHistory,
      communicationProfile
    );

    // Layer 3: Select and customize prompt template
    const baseTemplate = this.promptTemplates.selectOptimal(
      contextAnalysis.intent,
      communicationProfile.preferredStyle,
      contextAnalysis.complexity
    );

    // Layer 4: Apply dynamic personalization
    const personalizedPrompt = await this.personalizePrompt(
      baseTemplate,
      studentData,
      communicationProfile,
      contextAnalysis
    );

    return personalizedPrompt;
  }

  // ===== STUDENT COMMUNICATION PROFILING =====
  
  async personalizePrompt(template, studentData, profile, context) {
    /*
    This is where the magic happens. We're not just inserting variables into a template -
    we're dynamically adjusting the entire conversation approach based on what we know
    about this specific student's communication preferences and current emotional state.
    */
    
    const personalizationData = {
      // Basic personalization
      studentName: studentData.FirstName || 'there',
      preferredInstructor: await this.getPreferredInstructor(studentData),
      previousLessons: await this.getPreviousLessonContext(studentData),
      
      // Communication style adaptations
      formalityLevel: this.determineFormalityLevel(profile),
      responseLength: this.determineOptimalResponseLength(profile),
      explanationDepth: this.determineExplanationNeeds(profile, context),
      
      // Emotional and contextual adaptations
      empathyLevel: this.determineEmpathyNeeds(context),
      urgencyRecognition: this.assessUrgency(context),
      confidenceBuilding: this.assessConfidenceNeeeds(studentData, context),
      
      // Business context
      currentPromotions: await this.getCurrentPromotions(),
      weatherConsiderations: await this.getWeatherContext(),
      timeOfDayAdjustments: this.getTimeBasedAdjustments()
    };

    return this.applyAdvancedPersonalization(template, personalizationData);
  }

  // ===== COMMUNICATION STYLE ANALYSIS =====
  
  determineFormalityLevel(profile) {
    /*
    Understanding formality preferences is crucial for driving schools because students
    range from teenagers who prefer casual communication to adults who expect 
    professional service. Getting this wrong can make students uncomfortable.
    */
    
    const indicators = {
      casual: profile.usesSlang || profile.shortMessages || profile.informalGreetings,
      formal: profile.completeGrammar || profile.politeLanguage || profile.structuredQuestions,
      professional: profile.businessHours || profile.corporateEmail || profile.detailedInquiries
    };

    if (indicators.professional) return 'professional';
    if (indicators.formal) return 'formal';
    return 'casual';
  }

  determineOptimalResponseLength(profile) {
    /*
    Response length affects student satisfaction more than most people realize.
    Teenagers often prefer quick, to-the-point responses, while older adults
    appreciate thorough explanations that demonstrate professionalism.
    */
    
    if (profile.typicalMessageLength < 50) return 'concise'; // They send short messages
    if (profile.asksFollowUpQuestions) return 'detailed'; // They want thorough info
    if (profile.timeOfDayPattern === 'quick') return 'concise'; // They message during busy times
    
    return 'balanced';
  }

  // ===== EMOTIONAL INTELLIGENCE IN PROMPTS =====
  
  async assessEmotionalContext(message, history) {
    /*
    Emotional context is critical for driving schools because learning to drive is
    often stressful, especially for new drivers. The AI needs to recognize and
    respond appropriately to anxiety, frustration, excitement, or confidence.
    */
    
    const emotionalIndicators = {
      anxiety: this.detectAnxietyMarkers(message, history),
      frustration: this.detectFrustrationMarkers(message, history),
      excitement: this.detectExcitementMarkers(message, history),
      confidence: this.detectConfidenceMarkers(message, history),
      uncertainty: this.detectUncertaintyMarkers(message, history)
    };

    return {
      primaryEmotion: this.identifyPrimaryEmotion(emotionalIndicators),
      intensity: this.measureEmotionalIntensity(emotionalIndicators),
      responseStrategy: this.selectEmotionalResponseStrategy(emotionalIndicators)
    };
  }

  detectAnxietyMarkers(message, history) {
    const anxietyPatterns = [
      /nervous|scared|worried|anxious/i,
      /first time|never driven/i,
      /what if|nervous about/i,
      /hard|difficult|scary/i
    ];

    const recentFailures = history.some(msg => 
      /failed|didn't pass|need more practice/i.test(msg.content)
    );

    const multipleRescheduling = history.filter(msg =>
      /reschedule|change|postpone/i.test(msg.content)
    ).length > 2;

    return {
      linguisticMarkers: anxietyPatterns.some(pattern => pattern.test(message)),
      behavioralMarkers: recentFailures || multipleRescheduling,
      intensity: this.calculateAnxietyIntensity(message, history)
    };
  }

  // ===== DYNAMIC PROMPT TEMPLATES =====
  
  class DynamicPromptTemplates {
    constructor() {
      // Templates adapt based on student profile and context
      this.templates = {
        booking: {
          casual: {
            anxious: this.createAnxietyAwareBookingPrompt('casual'),
            confident: this.createConfidentBookingPrompt('casual'),
            neutral: this.createNeutralBookingPrompt('casual')
          },
          formal: {
            anxious: this.createAnxietyAwareBookingPrompt('formal'),
            confident: this.createConfidentBookingPrompt('formal'),
            neutral: this.createNeutralBookingPrompt('formal')
          },
          professional: {
            anxious: this.createAnxietyAwareBookingPrompt('professional'),
            confident: this.createConfidentBookingPrompt('professional'),
            neutral: this.createNeutralBookingPrompt('professional')
          }
        }
      };
    }

    createAnxietyAwareBookingPrompt(formalityLevel) {
      /*
      When students show anxiety about driving, the prompt needs to guide Claude
      to be extra reassuring, provide clear step-by-step guidance, and emphasize
      the safety and supportiveness of Ferrari's instruction approach.
      */
      
      const basePrompt = `
      You are a caring and reassuring assistant for Ferrari Driving School in NYC. 
      This student seems nervous or anxious about driving, which is completely normal 
      and understandable.

      EMOTIONAL TONE: Be extra patient, reassuring, and encouraging. Acknowledge that 
      learning to drive can feel overwhelming, but emphasize that Ferrari's instructors 
      are specially trained to help nervous students feel comfortable and confident.

      COMMUNICATION APPROACH:
      - Break down the booking process into simple, clear steps
      - Reassure them about the safety and supportiveness of the lessons
      - Mention that many students start nervous but become confident drivers
      - Offer to connect them with an instructor who specializes in nervous students
      - Use encouraging language like "You're taking a great first step" or "We'll go at your pace"

      SPECIFIC GUIDANCE:
      - If they seem overwhelmed by choices, offer to recommend the best option for beginners
      - Emphasize that lessons are designed to build confidence gradually
      - Mention safety features and dual-control cars
      - Let them know they can always ask questions or request a specific instructor
      `;

      return this.adaptForFormality(basePrompt, formalityLevel);
    }

    createConfidentBookingPrompt(formalityLevel) {
      /*
      Confident students want efficiency and options. They appreciate having control
      over their choices and getting straight to the details. The prompt should 
      guide Claude to be more direct while still being helpful.
      */
      
      const basePrompt = `
      You are an efficient and knowledgeable assistant for Ferrari Driving School. 
      This student appears confident and ready to take action on their driving lessons.

      COMMUNICATION APPROACH:
      - Be direct and efficient while remaining friendly
      - Present options clearly and let them choose
      - Provide specific details they need to make decisions
      - Respect their time and get to the point quickly
      - Assume they can handle multiple pieces of information at once

      SPECIFIC GUIDANCE:
      - Present instructor options with brief descriptions of specialties
      - Give them control over scheduling preferences
      - Offer advanced options if appropriate (highway driving, test prep, etc.)
      - Be ready to handle rapid-fire questions
      - Provide comprehensive information in organized format
      `;

      return this.adaptForFormality(basePrompt, formalityLevel);
    }

    adaptForFormality(basePrompt, formalityLevel) {
      const formalityAdjustments = {
        casual: `
        LANGUAGE STYLE: Keep it friendly and conversational. Use contractions, 
        simple language, and a warm tone. You can be a bit more informal but 
        still professional. Think "helpful friend" rather than "customer service."
        `,
        
        formal: `
        LANGUAGE STYLE: Maintain professional courtesy. Use complete sentences,
        proper grammar, and respectful language. Think "knowledgeable professional"
        who is approachable but maintains appropriate boundaries.
        `,
        
        professional: `
        LANGUAGE STYLE: Use business-appropriate communication. Be precise,
        thorough, and efficient. Focus on providing complete information and
        demonstrating expertise. Think "trusted advisor" with deep knowledge.
        `
      };

      return basePrompt + formalityAdjustments[formalityLevel];
    }
  }

  // ===== CONTEXT-AWARE RESPONSE OPTIMIZATION =====

  async optimizeForContext(prompt, contextData) {
    /*
    Context optimization adjusts the prompt based on external factors that
    affect the conversation. This includes time of day, weather, recent events,
    and business conditions that might impact the student's experience.
    */
    
    let optimizedPrompt = prompt;

    // Time-based optimizations
    if (contextData.timeOfDay === 'evening') {
      optimizedPrompt += `
      TIME CONTEXT: It's evening, so the student might be planning for upcoming lessons
      or have had time to think about their driving goals. They may be more reflective
      and willing to discuss their learning objectives in detail.
      `;
    }

    // Weather-based optimizations
    if (contextData.weather?.conditions === 'rain') {
      optimizedPrompt += `
      WEATHER CONTEXT: It's raining, which affects driving lessons. Be prepared to:
      - Discuss how Ferrari handles lessons in different weather conditions
      - Mention that rain provides valuable real-world driving experience
      - Offer flexibility for rescheduling if the student is concerned
      - Reassure about safety measures during weather-related lessons
      `;
    }

    // Business context optimizations
    if (contextData.businessContext?.isHighDemandPeriod) {
      optimizedPrompt += `
      DEMAND CONTEXT: This is a high-demand period for driving lessons. Be prepared to:
      - Mention that booking soon is recommended due to high demand
      - Offer multiple date options to increase booking success
      - Suggest less popular time slots that might work well
      - Emphasize the value of securing their preferred instructor
      `;
    }

    return optimizedPrompt;
  }

  // ===== CONTINUOUS LEARNING AND ADAPTATION =====

  async recordConversationOutcome(prompt, response, studentFeedback, bookingSuccess) {
    /*
    This is how the system gets smarter over time. By analyzing which prompts
    lead to successful conversations and satisfied students, we can continuously
    improve the prompt engineering approach.
    */
    
    const outcomeData = {
      promptId: this.generatePromptId(prompt),
      communicationProfile: await this.extractProfileFromPrompt(prompt),
      responseQuality: this.assessResponseQuality(response, studentFeedback),
      businessOutcome: bookingSuccess ? 'successful_booking' : 'no_booking',
      studentSatisfaction: studentFeedback?.rating || null,
      improvementAreas: this.identifyImprovementAreas(studentFeedback)
    };

    await this.learningDatabase.recordOutcome(outcomeData);
    
    // Trigger prompt optimization if we have enough data
    if (this.shouldOptimizePrompts()) {
      await this.optimizePromptTemplates();
    }
  }

  async optimizePromptTemplates() {
    /*
    Machine learning for prompt optimization. This analyzes patterns in successful
    conversations to identify what prompt elements work best for different types
    of students and situations.
    */
    
    const outcomeAnalysis = await this.learningDatabase.analyzeOutcomes();
    
    const optimizations = {
      highSuccessPatterns: outcomeAnalysis.identifySuccessPatterns(),
      lowSuccessPatterns: outcomeAnalysis.identifyFailurePatterns(),
      communicationPreferences: outcomeAnalysis.analyzeCommunicationPreferences(),
      emotionalResponseEffectiveness: outcomeAnalysis.analyzeEmotionalResponses()
    };

    // Update templates based on learnings
    await this.updateTemplatesBasedOnLearnings(optimizations);
    
    // A/B test new approaches
    await this.setupABTestsForNewApproaches(optimizations);
  }
}

// ===== EXAMPLE: ADVANCED PROMPT IN ACTION =====

async function demonstrateAdvancedPrompting() {
  const promptEngine = new AdvancedPromptEngine();
  
  // Scenario: Nervous student asking about first lesson
  const studentMessage = "Hi, I'm really nervous about learning to drive. I've never been behind the wheel before and I'm kind of scared. Do you think I could book a lesson?";
  
  const conversationHistory = []; // First message
  
  const studentData = {
    FirstName: "Sarah",
    age: 17, // Inferred from license data
    lessonsCompleted: 0,
    previousInstructors: []
  };

  const contextualPrompt = await promptEngine.generateContextualPrompt(
    studentMessage,
    conversationHistory,
    studentData
  );

  /*
  The resulting prompt would be specifically crafted to:
  1. Recognize Sarah's anxiety and address it with empathy
  2. Use age-appropriate, casual communication style
  3. Emphasize safety and gradual skill building
  4. Offer specific reassurances about first-time driver support
  5. Present information in non-overwhelming chunks
  6. Include subtle confidence-building language
  */

  console.log("Generated Contextual Prompt:", contextualPrompt);
  
  // The Claude response guided by this prompt would be far more effective
  // than a generic response because it's tailored to Sarah's specific needs
}

// ===== PERFORMANCE MONITORING FOR PROMPTS =====

class PromptPerformanceMonitor {
  constructor() {
    this.metrics = {
      responseQuality: new QualityMetrics(),
      businessOutcomes: new BusinessOutcomeTracker(),
      studentSatisfaction: new SatisfactionTracker(),
      conversationEfficiency: new EfficiencyMetrics()
    };
  }

  async evaluatePromptEffectiveness(promptId, timeframe = '30days') {
    /*
    This system tracks how well different prompt approaches are working
    and identifies opportunities for improvement. It's like A/B testing
    but for conversation quality and business outcomes.
    */
    
    const performance = await Promise.all([
      this.metrics.responseQuality.analyze(promptId, timeframe),
      this.metrics.businessOutcomes.analyze(promptId, timeframe),
      this.metrics.studentSatisfaction.analyze(promptId, timeframe),
      this.metrics.conversationEfficiency.analyze(promptId, timeframe)
    ]);

    return {
      overallScore: this.calculateOverallScore(performance),
      strengths: this.identifyStrengths(performance),
      improvementOpportunities: this.identifyImprovements(performance),
      recommendations: this.generateRecommendations(performance)
    };
  }
}

module.exports = {
  AdvancedPromptEngine,
  DynamicPromptTemplates,
  PromptPerformanceMonitor
};