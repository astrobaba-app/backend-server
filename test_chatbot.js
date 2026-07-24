const axios = require('axios');

async function test() {
  const sessionId = 'test_session_opt_' + Date.now();
  console.log('Using sessionId:', sessionId);

  try {
    console.log('\n--- Test 1: Daily Horoscope Flow ---');
    const res1 = await axios.post('http://localhost:6001/api/workflow-chatbot/message', {
      message: 'Daily Horoscope',
      sessionId: sessionId
    });
    console.log('Response 1 Status:', res1.status);
    console.log('Response 1 State:', res1.data.state);

    const res2 = await axios.post('http://localhost:6001/api/workflow-chatbot/message', {
      message: 'Gemini',
      sessionId: sessionId
    });
    console.log('Response 2 Status:', res2.status);
    console.log('Response 2 Message Snippet:', res2.data.message.substring(0, 100) + '...');
    console.log('Response 2 State:', res2.data.state);

    console.log('\n--- Test 2: Monthly Report Flow ---');
    const res3 = await axios.post('http://localhost:6001/api/workflow-chatbot/message', {
      message: 'Monthly Report',
      sessionId: sessionId
    });
    console.log('Response 3 Status:', res3.status);
    console.log('Response 3 State:', res3.data.state);

    const res4 = await axios.post('http://localhost:6001/api/workflow-chatbot/message', {
      message: 'Leo',
      sessionId: sessionId
    });
    console.log('Response 4 Status:', res4.status);
    console.log('Response 4 Message Snippet:', res4.data.message.substring(0, 100) + '...');
    console.log('Response 4 State:', res4.data.state);

    console.log('\n--- Test 3: Yearly Report Flow ---');
    const res5 = await axios.post('http://localhost:6001/api/workflow-chatbot/message', {
      message: 'Yearly Report',
      sessionId: sessionId
    });
    console.log('Response 5 Status:', res5.status);
    console.log('Response 5 State:', res5.data.state);

    const res6 = await axios.post('http://localhost:6001/api/workflow-chatbot/message', {
      message: 'Taurus',
      sessionId: sessionId
    });
    console.log('Response 6 Status:', res6.status);
    console.log('Response 6 Message Snippet:', res6.data.message.substring(0, 100) + '...');
    console.log('Response 6 State:', res6.data.state);

  } catch (error) {
    console.error('Test failed with full error details:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error);
    }
  }
}

test();

