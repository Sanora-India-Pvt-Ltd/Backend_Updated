const Institution = require('../models/Institution');

// Search institutions by name
const searchInstitutions = async (req, res) => {
    try {
        const { query, type } = req.query;

        if (!query || query.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const searchTerm = query.trim();
        const normalizedSearchTerm = searchTerm.toLowerCase();

        // Build search query
        const searchQuery = {
            $or: [
                { name: { $regex: searchTerm, $options: 'i' } },
                { normalizedName: { $regex: normalizedSearchTerm, $options: 'i' } }
            ]
        };

        // Filter by type if provided
        if (type && ['school', 'college', 'university', 'others'].includes(type)) {
            searchQuery.type = type;
        }

        // Search for institutions that match the query (case-insensitive)
        const institutions = await Institution.find(searchQuery)
        .limit(20) // Limit results to 20
        .sort({ name: 1 }) // Sort alphabetically
        .select('name type city country logo verified isCustom createdAt');

        // If no matches found, return special flag to allow custom entry
        if (institutions.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No institutions found',
                data: {
                    institutions: [],
                    canAddCustom: true,
                    suggestedName: searchTerm
                }
            });
        }

        // Return found institutions
        return res.status(200).json({
            success: true,
            message: `Found ${institutions.length} institution/institutions`,
            data: {
                institutions: institutions.map(institution => ({
                    id: institution._id,
                    name: institution.name,
                    type: institution.type,
                    city: institution.city,
                    country: institution.country,
                    logo: institution.logo,
                    verified: institution.verified,
                    isCustom: institution.isCustom,
                    createdAt: institution.createdAt
                })),
                canAddCustom: false,
                suggestedName: null
            }
        });

    } catch (error) {
        console.error('Search institutions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching institutions',
            error: error.message
        });
    }
};

// Create a new institution (custom entry)
const createInstitution = async (req, res) => {
    try {
        const { name, type, city, country, logo } = req.body;
        const user = req.user; // From protect middleware

        if (!name || name.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Institution name is required'
            });
        }

        const institutionName = name.trim();
        const normalizedName = institutionName.toLowerCase();
        const institutionType = (type && ['school', 'college', 'university', 'others'].includes(type)) 
            ? type 
            : 'school'; // Default to school if invalid type

        // Check if institution already exists
        const existingInstitution = await Institution.findOne({
            $or: [
                { name: institutionName },
                { normalizedName: normalizedName }
            ]
        });

        if (existingInstitution) {
            return res.status(200).json({
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
            });
        }

        // Create new institution
        const newInstitution = await Institution.create({
            name: institutionName,
            normalizedName: normalizedName,
            type: institutionType,
            city: city || '',
            country: country || '',
            logo: logo || '',
            verified: false,
            isCustom: true,
            createdBy: user._id
        });

        return res.status(201).json({
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
        });

    } catch (error) {
        console.error('Create institution error:', error);
        
        // Handle duplicate key error (race condition)
        if (error.code === 11000) {
            // Institution was created by another request, fetch it
            const institutionName = req.body.name.trim();
            const normalizedName = institutionName.toLowerCase();
            const existingInstitution = await Institution.findOne({
                $or: [
                    { name: institutionName },
                    { normalizedName: normalizedName }
                ]
            });

            if (existingInstitution) {
                return res.status(200).json({
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
                });
            }
        }

        res.status(500).json({
            success: false,
            message: 'Error creating institution',
            error: error.message
        });
    }
};

module.exports = {
    searchInstitutions,
    createInstitution
};

