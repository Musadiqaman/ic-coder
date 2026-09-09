// backend : src/routes/aiAssistant.js  

import express from 'express';
import { processVoiceCommand } from '../controllers/aiAssistantController.js';

const router = express.Router();

router.post('/process', processVoiceCommand);

export default router; // <-- Must be export default