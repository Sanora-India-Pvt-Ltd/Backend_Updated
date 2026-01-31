const institutionService = require('../../app/services/institution.service');

const searchInstitutions = async (req, res) => {
  try {
    const result = await institutionService.searchInstitutions(req.query);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error searching institutions',
      error: err.message
    });
  }
};

const createInstitution = async (req, res) => {
  try {
    const result = await institutionService.createInstitution(req.user._id, req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error creating institution',
      error: err.message
    });
  }
};

module.exports = {
  searchInstitutions,
  createInstitution
};
