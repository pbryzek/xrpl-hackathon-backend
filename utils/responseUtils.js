function successJSON(msg, data) {
  let retData = {
    success: true,
    message: msg,
    data: data,
  };
  return retData;
}

/**
 * Creates a JSON object with success set to false and a specified message.
 *
 * @param {string} msg - The message to be included in the JSON object.
 * @return {Object} retData - The JSON object with success, message, and data properties.
 */
function failJSON(msg) {
  let retData = {
    success: false,
    message: msg,
  };
  return retData;
}

// Export the functions
module.exports = {
  failJSON,
  successJSON,
};
