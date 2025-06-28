const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Initialize Firebase
const firebaseConfig = {
  projectId: 'easy-fantasy',
  // Add other config if needed
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'europe-west3');

async function testGameScoreProcessing() {
  try {
    console.log('Testing game score processing for Week 1...');
    
    const manualFetchAndProcessGameStatsForWeek = httpsCallable(functions, 'manualFetchAndProcessGameStatsForWeek');
    
    const result = await manualFetchAndProcessGameStatsForWeek({
      week: 1
    });
    
    console.log('Function result:', result.data);
  } catch (error) {
    console.error('Error calling function:', error);
  }
}

testGameScoreProcessing(); 