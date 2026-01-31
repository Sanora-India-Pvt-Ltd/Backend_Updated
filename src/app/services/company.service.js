/**
 * Company search and create. Used by companyController.
 */

const Company = require('../../models/authorization/Company');

async function searchCompanies(query) {
  const q = (query?.query || '').trim();
  if (!q) {
    return {
      statusCode: 400,
      json: { success: false, message: 'Search query is required' }
    };
  }

  const normalizedSearchTerm = q.toLowerCase();
  const companies = await Company.find({
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { normalizedName: { $regex: normalizedSearchTerm, $options: 'i' } }
    ]
  })
    .limit(20)
    .sort({ name: 1 })
    .select('name isCustom createdAt')
    .lean();

  if (companies.length === 0) {
    return {
      statusCode: 200,
      json: {
        success: true,
        message: 'No companies found',
        data: { companies: [], canAddCustom: true, suggestedName: q }
      }
    };
  }

  return {
    statusCode: 200,
    json: {
      success: true,
      message: `Found ${companies.length} company/companies`,
      data: {
        companies: companies.map((company) => ({
          id: company._id,
          name: company.name,
          isCustom: company.isCustom,
          createdAt: company.createdAt
        })),
        canAddCustom: false,
        suggestedName: null
      }
    }
  };
}

async function createCompany(userId, body) {
  const name = (body?.name || '').trim();
  if (!name) {
    return {
      statusCode: 400,
      json: { success: false, message: 'Company name is required' }
    };
  }

  const normalizedName = name.toLowerCase();
  const existingCompany = await Company.findOne({
    $or: [{ name }, { normalizedName }]
  });

  if (existingCompany) {
    return {
      statusCode: 200,
      json: {
        success: true,
        message: 'Company already exists',
        data: {
          company: {
            id: existingCompany._id,
            name: existingCompany.name,
            isCustom: existingCompany.isCustom,
            createdAt: existingCompany.createdAt
          }
        }
      }
    };
  }

  try {
    const newCompany = await Company.create({
      name,
      normalizedName,
      isCustom: true,
      createdBy: userId
    });

    return {
      statusCode: 201,
      json: {
        success: true,
        message: 'Company created successfully',
        data: {
          company: {
            id: newCompany._id,
            name: newCompany.name,
            isCustom: newCompany.isCustom,
            createdAt: newCompany.createdAt
          }
        }
      }
    };
  } catch (error) {
    if (error.code === 11000) {
      const existingCompany = await Company.findOne({
        $or: [{ name }, { normalizedName }]
      });
      if (existingCompany) {
        return {
          statusCode: 200,
          json: {
            success: true,
            message: 'Company already exists',
            data: {
              company: {
                id: existingCompany._id,
                name: existingCompany.name,
                isCustom: existingCompany.isCustom,
                createdAt: existingCompany.createdAt
              }
            }
          }
        };
      }
    }
    throw error;
  }
}

module.exports = {
  searchCompanies,
  createCompany
};
