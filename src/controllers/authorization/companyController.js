const companyService = require('../../app/services/company.service');

const searchCompanies = async (req, res) => {
  try {
    const result = await companyService.searchCompanies(req.query);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error searching companies',
      error: err.message
    });
  }
};

const createCompany = async (req, res) => {
  try {
    const result = await companyService.createCompany(req.user._id, req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error creating company',
      error: err.message
    });
  }
};

module.exports = {
  searchCompanies,
  createCompany
};
