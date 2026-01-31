/**
 * Institution search and create. Used by institutionController.
 */

const Institution = require('../../models/authorization/Institution');

async function searchInstitutions(query) {
  const q = (query?.query || '').trim();
  if (!q) {
    return {
      statusCode: 400,
      json: { success: false, message: 'Search query is required' }
    };
  }

  const normalizedSearchTerm = q.toLowerCase();
  const searchQuery = {
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { normalizedName: { $regex: normalizedSearchTerm, $options: 'i' } }
    ]
  };

  const type = query?.type;
  if (type && ['school', 'college', 'university', 'others'].includes(type)) {
    searchQuery.type = type;
  }

  const institutions = await Institution.find(searchQuery)
    .limit(20)
    .sort({ name: 1 })
    .select('name type city country logo verified isCustom createdAt')
    .lean();

  if (institutions.length === 0) {
    return {
      statusCode: 200,
      json: {
        success: true,
        message: 'No institutions found',
        data: { institutions: [], canAddCustom: true, suggestedName: q }
      }
    };
  }

  return {
    statusCode: 200,
    json: {
      success: true,
      message: `Found ${institutions.length} institution/institutions`,
      data: {
        institutions: institutions.map((inst) => ({
          id: inst._id,
          name: inst.name,
          type: inst.type,
          city: inst.city,
          country: inst.country,
          logo: inst.logo,
          verified: inst.verified,
          isCustom: inst.isCustom,
          createdAt: inst.createdAt
        })),
        canAddCustom: false,
        suggestedName: null
      }
    }
  };
}

async function createInstitution(userId, body) {
  const name = (body?.name || '').trim();
  if (!name) {
    return {
      statusCode: 400,
      json: { success: false, message: 'Institution name is required' }
    };
  }

  const normalizedName = name.toLowerCase();
  const type =
    body?.type && ['school', 'college', 'university', 'others'].includes(body.type)
      ? body.type
      : 'school';
  const city = body?.city || '';
  const country = body?.country || '';
  const logo = body?.logo || '';

  const existingInstitution = await Institution.findOne({
    $or: [{ name }, { normalizedName }]
  });

  if (existingInstitution) {
    return {
      statusCode: 200,
      json: {
        success: true,
        message: 'Institution already exists',
        data: {
          institution: {
            id: existingInstitution._id,
            name: existingInstitution.name,
            type: existingInstitution.type,
            city: existingInstitution.city,
            country: existingInstitution.country,
            logo: existingInstitution.logo,
            verified: existingInstitution.verified,
            isCustom: existingInstitution.isCustom,
            createdAt: existingInstitution.createdAt
          }
        }
      }
    };
  }

  try {
    const newInstitution = await Institution.create({
      name,
      normalizedName,
      type,
      city,
      country,
      logo,
      verified: false,
      isCustom: true,
      createdBy: userId
    });

    return {
      statusCode: 201,
      json: {
        success: true,
        message: 'Institution created successfully',
        data: {
          institution: {
            id: newInstitution._id,
            name: newInstitution.name,
            type: newInstitution.type,
            city: newInstitution.city,
            country: newInstitution.country,
            logo: newInstitution.logo,
            verified: newInstitution.verified,
            isCustom: newInstitution.isCustom,
            createdAt: newInstitution.createdAt
          }
        }
      }
    };
  } catch (error) {
    if (error.code === 11000) {
      const existingInstitution = await Institution.findOne({
        $or: [{ name }, { normalizedName }]
      });
      if (existingInstitution) {
        return {
          statusCode: 200,
          json: {
            success: true,
            message: 'Institution already exists',
            data: {
              institution: {
                id: existingInstitution._id,
                name: existingInstitution.name,
                type: existingInstitution.type,
                city: existingInstitution.city,
                country: existingInstitution.country,
                logo: existingInstitution.logo,
                verified: existingInstitution.verified,
                isCustom: existingInstitution.isCustom,
                createdAt: existingInstitution.createdAt
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
  searchInstitutions,
  createInstitution
};
