const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { message } = JSON.parse(event.body);

    // Create a new thread for each request (stateless)
    const thread = await openai.beta.threads.create();

    // Add the user's message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });

    // Check the run status
    let runStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    } while (runStatus.status !== 'completed' && runStatus.status !== 'failed');

    if (runStatus.status === 'failed') {
      throw new Error('Assistant run failed: ' + runStatus.last_error?.message);
    }

    // Retrieve the messages
    const messages = await openai.beta.threads.messages.list(thread.id);

    // Get the last message from the assistant
    const lastMessageForRun = messages.data
      .filter(message => message.run_id === run.id && message.role === 'assistant')
      .pop();

    if (lastMessageForRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: lastMessageForRun.content[0].text.value })
      };
    } else {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'No response from assistant.' })
      };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'An error occurred.', error: error.message })
    };
  }
};
