// ═══════════════════════════════════════════════════════════════
// quizzes.js — training quiz content (transcribed from the source quizzes).
// Question types: 'mc' (multiple choice, correct = option index),
// 'truefalse' (correct bool), 'open' (short answer — supervisor reviews),
// 'visual' (image-based — supervisor reviews). The quiz engine (built with
// the training foundation) auto-scores mc/truefalse and routes open/visual
// to the supervisor, matching each sheet's "review wrong answers + sign" step.
// Pass threshold 90%, annual recurrence.
// ═══════════════════════════════════════════════════════════════
export const QUIZZES = {
    '8.4': {
        code: '8.4', title: 'HACCP Training Quiz', sopCode: '8.2',
        passThreshold: 90, recurrence: 'annual', supervisorReview: true,
        questions: [
            { id: 'q1', prompt: 'What does HACCP stand for?', type: 'mc', options: ['Happy And Careful Corrections Program', 'Hazard Analysis Critical Control Point', 'Helpful Analysis Choice Control Point', 'Heaps of Agonizing Crappy Confusing Paperwork'], correct: 1 },
            { id: 'q2', prompt: 'HACCP is a program used to control:', type: 'mc', options: ['Pest control', 'Food Safety', 'Worker Health and Safety', 'Visitors'], correct: 1 },
            { id: 'q3', prompt: 'In HACCP, we never keep records.', type: 'truefalse', correct: false },
            { id: 'q4', prompt: 'List 3 Prerequisite Programs.', type: 'open' },
            { id: 'q5', prompt: 'What does CCP stand for?', type: 'open', note: 'Critical Control Point' },
            { id: 'q6', prompt: 'Name the 3 types of hazards considered during hazard analysis.', type: 'open', note: 'Biological, Chemical, Physical' },
            { id: 'q7', prompt: 'Give an example for each type of hazard listed above.', type: 'open' }
        ]
    },
    '8.5': {
        code: '8.5', title: 'Personal Hygiene Training Quiz', sopCode: '8.1',
        passThreshold: 90, recurrence: 'annual', supervisorReview: true,
        questions: [
            { id: 'q1', prompt: 'When must hands be washed?', type: 'mc', options: ['Before working with exposed product', 'When entering the production/food handling area', 'After eating and smoking', 'After using the washroom', 'All of the above'], correct: 4 },
            { id: 'q2', prompt: 'What is allowed in the production area?', type: 'mc', options: ['Food, gum, cigarettes', 'Necklace, nail polish, false eyelashes', 'Pens carried in pockets above the waist', 'Paperwork, medical alert bracelet, gloves'], correct: 3 },
            { id: 'q3', prompt: 'Can employees bring peanuts, milk, cookies, soda into the production area?', type: 'truefalse', correct: false },
            { id: 'q4', prompt: 'What is the proper procedure if you have a cut on your hand and require a band aid?', type: 'open' },
            { id: 'q5', prompt: "What should you do if you notice someone you don't recognize in the production area?", type: 'open' },
            { id: 'q6', prompt: 'How can we keep unauthorized allergens from getting into the products? (name 2)', type: 'open' },
            { id: 'q7', prompt: 'What should you do if you see evidence of pests (mouse, flies, chewed boxes, droppings)?', type: 'open' },
            { id: 'q8', prompt: 'Can we use dirty or damaged pallets?', type: 'truefalse', correct: false },
            { id: 'q9', prompt: 'What should you do if you are sick (fever, vomiting, diarrhea)?', type: 'open' },
            { id: 'q10', prompt: 'What are the steps for proper hand washing?', type: 'open' },
            { id: 'q11', prompt: 'Cross contamination is:', type: 'mc', options: ['When something dirty touches something clean', 'When you forgot to wash your hands after eating', 'When you picked up garbage from the floor and then put cheese in the shredder', 'When you wore your smock in the bathroom', 'All the above', 'None of the above'], correct: 4 },
            { id: 'q12', prompt: 'Who is responsible for food safety in the plant?', type: 'open', note: 'Everyone' }
        ]
    },
    'GMP': {
        code: 'GMP', title: 'GMP Quiz', sopCode: '8.1',
        passThreshold: 90, recurrence: 'annual', supervisorReview: true,
        questions: [
            { id: 'q1', prompt: 'Circle all the items that are NOT Good Manufacturing Practices.', type: 'visual', note: 'Source is an image-based spot-the-issue sheet (gmp_quiz.pdf); needs the original image set digitized, or supervisor-administered.' }
        ]
    }
};

export function getQuiz(code) { return QUIZZES[code] || null; }
