# CloudBase Models Skill

## When to use this skill

Use this skill when working with CloudBase Models API for MySQL database operations in cloud functions. This is the **official recommended approach** for database operations in CloudBase cloud functions.

**Use this skill for:**
- Simple CRUD operations (CREATE, READ, UPDATE, DELETE) - **PRIORITY: Use ORM API**
- Complex SQL queries with JOIN, GROUP BY, aggregations - Use `$runSQL()`
- Understanding CloudBase Models initialization and configuration
- Automatic data validation and relationship management

**Do NOT use this skill for:**
- Frontend database operations (use Web SDK or Mini Program SDK)
- NoSQL/document database operations (use collection APIs)
- Direct MySQL client connections (CloudBase abstracts this)

## Core Concepts

### What are CloudBase Models?

CloudBase Models is a declarative data management layer that sits on top of CloudBase databases. It provides:

1. **ORM-like abstraction** - Each model maps to a database table/collection
2. **Automatic validation** - Type checking and format validation before data enters DB
3. **Relationship management** - Handles one-to-one, one-to-many, many-to-many relationships
4. **Multi-platform SDKs** - Define once, use across Web, Mini Program, and cloud functions
5. **Raw SQL execution** - `$runSQL()` and `$runSQLRaw()` for complex queries

### Key Principles (IMPORTANT)

**🎯 PRIORITY 1: Use ORM API for simple CRUD operations**

```javascript
// ✅ RECOMMENDED - Use ORM API for simple operations
const { data } = await app.models.plants.create({
  data: { nickname: "Rose", location: "Garden" }
});
```

**Benefits:**
- ✅ Automatic `_id` generation
- ✅ Automatic `_openid` population (user identity)
- ✅ Automatic `createdAt`/`updatedAt` timestamps
- ✅ Automatic data validation and type checking
- ✅ 40-50% less code
- ✅ More maintainable and readable

**🎯 PRIORITY 2: Use `$runSQL()` only for complex queries**

```javascript
// ✅ Use $runSQL for complex JOIN/aggregation queries
const result = await app.models.$runSQL(`
  SELECT p.*, COUNT(i._id) as image_count
  FROM plants p
  LEFT JOIN plant_images i ON p._id = i.plantId
  WHERE p._openid = {{openid}}
  GROUP BY p._id
`, { openid });
```

**When to use `$runSQL()`:**
- Complex JOIN queries across multiple tables
- Aggregation with GROUP BY, HAVING
- Batch operations
- Performance-critical queries requiring precise SQL control

This is the official CloudBase approach that:
- Prevents SQL injection through Mustache template syntax
- Handles connection pooling automatically
- Provides consistent error handling
- Works seamlessly with CloudBase authentication (`_openid`)

## Initialization

### Cloud Function Setup

```javascript
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: process.env.TCB_ENV || 'your-env-id'
});

// Access models API
const models = app.models;

// Access database API (for NoSQL operations)
const db = app.database();
```

**Required dependency in `package.json`:**

```json
{
  "dependencies": {
    "@cloudbase/node-sdk": "^3.16.0"
  }
}
```

### Environment Configuration

- Use `process.env.TCB_ENV` to automatically get current environment ID
- Fallback to hardcoded environment ID for local testing
- No additional configuration needed for MySQL connection

## ORM API (PRIORITY - Use First)

### Why Use ORM API?

The ORM API should be your **first choice** for simple CRUD operations because it:

1. **Reduces code by 40-50%** - No manual ID generation, timestamp management, or parameter mapping
2. **Automatic field management**:
   - `_id` - Auto-generated unique identifier
   - `_openid` - Auto-populated with current user identity
   - `createdAt`/`updatedAt` - Auto-managed timestamps
   - `createBy`/`updateBy` - Auto-set to current user
3. **Built-in validation** - Type checking, required fields, format validation
4. **Safer** - No SQL injection risk, automatic escaping
5. **More maintainable** - Cleaner, more readable code

### CREATE Operation

```javascript
// Create a plant record
const { data: plant } = await app.models.plants.create({
  data: {
    nickname: "My Rose",
    scientificName: "Rosa chinensis",
    category: "花卉",
    location: "花园",
    plantDate: "2024-01-15",
    notes: "需要每天浇水",
    image: "cloud://xxx.jpg",
    health_status: "healthy",
    health_score: 100
  }
});

console.log(plant._id);  // Auto-generated ID
console.log(plant._openid);  // Auto-populated user identity
console.log(plant.createdAt);  // Auto-set timestamp
```

**What happens automatically:**
- ✅ `_id` is generated (e.g., `"rec_1234567890"`)
- ✅ `_openid` is set to current user's identity
- ✅ `createdAt` and `updatedAt` are set to current timestamp
- ✅ `createBy` and `updateBy` are set to current user
- ✅ Data is validated against model schema

### READ Operations

#### Get single record by ID

```javascript
const { data: plant } = await app.models.plants.get({
  filter: { _id: plantId }
});
```

#### List records with filters

```javascript
const { data: plantList } = await app.models.plants.list({
  filter: {
    category: "花卉",
    health_status: "healthy"
  },
  select: ["_id", "nickname", "location", "plantDate"],
  orderBy: [{ createdAt: "desc" }],
  limit: 10,
  offset: 0
});
```

#### Query with relationships

```javascript
// Get plant with related images
const { data: plant } = await app.models.plants.get({
  filter: { _id: plantId },
  select: {
    _id: true,
    nickname: true,
    location: true,
    images: {  // Related model
      select: ["url", "uploadedAt"],
      orderBy: [{ uploadedAt: "desc" }]
    }
  }
});
```

### UPDATE Operation

```javascript
// Update plant record
const { data: updated } = await app.models.plants.update({
  filter: { _id: plantId },
  data: {
    nickname: "Updated Name",
    health_status: "needs_attention",
    health_score: 75
  }
});

// updatedAt is automatically updated
// updateBy is automatically set to current user
```

### DELETE Operation

```javascript
// Delete plant record
await app.models.plants.delete({
  filter: { _id: plantId }
});

// Also delete related images
await app.models.plant_images.delete({
  filter: { plantId: plantId }
});
```

### Complete Example: savePlant with ORM API

```javascript
'use strict';

const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: process.env.TCB_ENV || 'cloud1-2grufevs395a9d5e'
});

exports.main = async (event, context) => {
  try {
    // Validate required fields
    const { nickname, location, plantDate, notes, image, scientificName, category } = event;

    if (!nickname) {
      return {
        code: 400,
        message: '缺少必填字段：nickname（植物昵称）',
        data: null
      };
    }

    // Use ORM API to create plant record
    const { data: plant } = await app.models.plants.create({
      data: {
        nickname: nickname,
        scientificName: scientificName || '',
        category: category || '',
        location: location || '未指定',
        plantDate: plantDate || new Date().toISOString().split('T')[0],
        notes: notes || '',
        image: image || '',
        health_status: 'healthy',
        health_score: 100
      }
    });

    console.log('植物创建成功:', plant);

    // Save image record if image exists
    if (image) {
      try {
        await app.models.plant_images.create({
          data: {
            plantId: plant._id,
            fileId: image,
            url: image,
            uploadedAt: Date.now()
          }
        });
      } catch (imgErr) {
        console.warn('保存图片记录失败:', imgErr);
      }
    }

    return {
      code: 200,
      message: '植物数据保存成功',
      data: {
        plantId: plant._id,
        nickname: plant.nickname,
        location: plant.location,
        plantDate: plant.plantDate,
        image: plant.image
      }
    };

  } catch (error) {
    console.error('保存植物数据失败:', error);
    return {
      code: 500,
      message: `保存失败: ${error.message}`,
      data: null,
      stack: error.stack
    };
  }
};
```

**Code comparison:**
- ORM API: ~50 lines
- `$runSQL()`: ~80 lines
- **40% less code with ORM API!**

## SQL Execution with $runSQL() (For Complex Queries)

### Basic Syntax

```javascript
const result = await app.models.$runSQL(sqlTemplate, params);
```

**Parameters:**
- `sqlTemplate` (string): SQL query with Mustache placeholders `{{paramName}}`
- `params` (object): Key-value pairs for parameter substitution

### Parameterized Query Pattern

**✅ CORRECT - Use Mustache syntax:**

```javascript
const insertSQL = `
  INSERT INTO plants (
    _id, _openid, nickname, location, plantDate
  ) VALUES (
    {{plantId}}, {{openid}}, {{nickname}}, {{location}}, {{plantDate}}
  )
`;

const result = await app.models.$runSQL(insertSQL, {
  plantId: 'plant_123',
  openid: 'user_openid',
  nickname: 'My Rose',
  location: 'Garden',
  plantDate: '2024-01-15'
});
```

**❌ WRONG - String concatenation (SQL injection risk):**

```javascript
// NEVER DO THIS
const sql = `INSERT INTO plants VALUES ('${plantId}', '${openid}', ...)`;
await app.models.$runSQL(sql, {});
```

### Common Operations

#### INSERT

```javascript
const insertSQL = `
  INSERT INTO users (
    _id, _openid, username, email, createdAt
  ) VALUES (
    {{userId}}, {{openid}}, {{username}}, {{email}}, {{timestamp}}
  )
`;

await app.models.$runSQL(insertSQL, {
  userId: `user_${Date.now()}`,
  openid: context.wxContext.OPENID,
  username: 'john_doe',
  email: 'john@example.com',
  timestamp: Date.now()
});
```

#### UPDATE

```javascript
const updateSQL = `
  UPDATE plants
  SET nickname = {{nickname}}, updatedAt = {{timestamp}}
  WHERE _id = {{plantId}} AND _openid = {{openid}}
`;

await app.models.$runSQL(updateSQL, {
  nickname: 'Updated Name',
  timestamp: Date.now(),
  plantId: 'plant_123',
  openid: context.wxContext.OPENID
});
```

#### SELECT

```javascript
const selectSQL = `
  SELECT _id, nickname, location, plantDate
  FROM plants
  WHERE _openid = {{openid}}
  ORDER BY createdAt DESC
  LIMIT {{limit}}
`;

const result = await app.models.$runSQL(selectSQL, {
  openid: context.wxContext.OPENID,
  limit: 10
});

console.log(result); // Array of matching rows
```

#### DELETE

```javascript
const deleteSQL = `
  DELETE FROM plants
  WHERE _id = {{plantId}} AND _openid = {{openid}}
`;

await app.models.$runSQL(deleteSQL, {
  plantId: 'plant_123',
  openid: context.wxContext.OPENID
});
```

### Handling NULL Values

```javascript
const insertSQL = `
  INSERT INTO plants (
    _id, _openid, nickname, notes
  ) VALUES (
    {{plantId}}, {{openid}}, {{nickname}}, {{notes}}
  )
`;

await app.models.$runSQL(insertSQL, {
  plantId: 'plant_123',
  openid: 'user_openid',
  nickname: 'Rose',
  notes: null  // Will insert NULL into database
});
```

### Complex Queries

```javascript
const complexSQL = `
  SELECT
    p._id,
    p.nickname,
    COUNT(i._id) as image_count
  FROM plants p
  LEFT JOIN plant_images i ON p._id = i.plantId
  WHERE p._openid = {{openid}}
    AND p.createdAt >= {{startDate}}
  GROUP BY p._id
  HAVING image_count > {{minImages}}
  ORDER BY p.createdAt DESC
`;

const result = await app.models.$runSQL(complexSQL, {
  openid: context.wxContext.OPENID,
  startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
  minImages: 2
});
```

## Data Field Types

CloudBase supports **20+ field types** for model definitions:

### Basic Types

| Type | Description | Example |
|------|-------------|---------|
| String | Single-line text | `VARCHAR(255)` |
| Text | Multi-line text | `TEXT` |
| Number | Integer or decimal | `INT`, `DECIMAL(10,2)` |
| Boolean | True/false | `BOOLEAN` |
| DateTime | Timestamp | `BIGINT` (milliseconds) or `DATETIME` |
| JSON | JSON object | `JSON` |
| Array | Array of values | `JSON` array |

### Specialized Types

| Type | Description | Validation |
|------|-------------|------------|
| Email | Email address | `xx@yy.zz` format |
| Phone | Phone number | 2-3 digit area code + 7-8 digits |
| URL | Web address | Valid URL format |
| Location | Geographic coordinates | `{lat: number, lng: number}` |
| Image | Cloud storage ID | CloudBase file ID |
| Video | Video file | mp4, avi formats |
| Audio | Audio file | mp3, wav formats |
| RichText | Formatted text | Up to 262KB |
| Markdown | Markdown content | Up to 262KB |

### Special Fields

#### _openid (Required for User Access Control)

**CRITICAL:** Every table must include `_openid` field for per-user access control:

```sql
CREATE TABLE plants (
  _id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  nickname VARCHAR(100),
  -- other fields...
);
```

**Important:** When a user is logged in, `_openid` is **automatically populated by the server** with the current user's identity. You do NOT need to manually set this field in INSERT operations.

```javascript
// ✅ CORRECT - Server auto-fills _openid
const insertSQL = `
  INSERT INTO plants (_id, nickname, location)
  VALUES ({{plantId}}, {{nickname}}, {{location}})
`;

await app.models.$runSQL(insertSQL, {
  plantId: 'plant_123',
  nickname: 'Rose',
  location: 'Garden'
  // No need to pass _openid - server handles it
});
```

#### Auto-numbering Fields

Use tokens for automatic value generation:

- `{SEQNUM}` - Sequential number
- `{DATETIMEUTC}` - UTC timestamp
- `{RANDSTRING}` - Random string

Example: `ORDER_{DATETIMEUTC}_{SEQNUM}` → `ORDER_20240115120000_001`

### Field Constraints

```javascript
// Field configuration example
{
  name: 'email',
  type: 'Email',
  required: true,      // Cannot be null
  unique: true,        // Must be unique across table
  defaultValue: '',    // Default if not provided
  validation: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
}
```

## Error Handling

### Common Errors

#### 1. SQL Syntax Error

```javascript
try {
  await app.models.$runSQL(sql, params);
} catch (error) {
  if (error.message.includes('SQLSTATE')) {
    console.error('SQL syntax error:', error.message);
    // Check for typos in column names, table names, or SQL syntax
  }
}
```

#### 2. Missing Column

```
Unknown column 'columnName' in 'field list'
```

**Solution:** Add missing column with ALTER TABLE:

```javascript
const alterSQL = `
  ALTER TABLE plants
  ADD COLUMN scientificName VARCHAR(100),
  ADD COLUMN category VARCHAR(50)
`;

await app.models.$runSQL(alterSQL, {});
```

#### 3. Parameter Mismatch

```javascript
// ❌ WRONG - Missing parameter
const sql = `SELECT * FROM plants WHERE _id = {{plantId}}`;
await app.models.$runSQL(sql, {}); // Error: plantId not provided

// ✅ CORRECT
await app.models.$runSQL(sql, { plantId: 'plant_123' });
```

### Best Practices for Error Handling

```javascript
exports.main = async (event, context) => {
  try {
    // Validate input
    if (!event.nickname) {
      return {
        code: 400,
        message: '缺少必填字段：nickname',
        data: null
      };
    }

    // Execute SQL
    const result = await app.models.$runSQL(sql, params);

    return {
      code: 200,
      message: '操作成功',
      data: result
    };

  } catch (error) {
    console.error('Database operation failed:', error);

    return {
      code: 500,
      message: `操作失败: ${error.message}`,
      data: null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
};
```

## Complete Example: savePlant Cloud Function

```javascript
'use strict';

const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: process.env.TCB_ENV || 'cloud1-2grufevs395a9d5e'
});

exports.main = async (event, context) => {
  try {
    // Get user identity
    const wxContext = context.wxContext || {};
    const openid = wxContext.OPENID || event.openid || 'anonymous_user';

    // Validate required fields
    const { nickname, location, plantDate, notes, image, scientificName, category } = event;

    if (!nickname) {
      return {
        code: 400,
        message: '缺少必填字段：nickname（植物昵称）',
        data: null
      };
    }

    // Generate unique ID and timestamp
    const plantId = `plant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // Parameterized INSERT query
    const insertPlantSQL = `
      INSERT INTO plants (
        _id, _openid, nickname, scientificName, category, location,
        plantDate, notes, image, health_status, health_score,
        createdAt, updatedAt, createBy, updateBy
      ) VALUES (
        {{plantId}}, {{openid}}, {{nickname}}, {{scientificName}}, {{category}}, {{location}},
        {{plantDate}}, {{notes}}, {{image}}, {{health_status}}, {{health_score}},
        {{createdAt}}, {{updatedAt}}, {{createBy}}, {{updateBy}}
      )
    `;

    const plantParams = {
      plantId: plantId,
      openid: openid,
      nickname: nickname || '',
      scientificName: scientificName || '',
      category: category || '',
      location: location || '未指定',
      plantDate: plantDate || new Date().toISOString().split('T')[0],
      notes: notes || '',
      image: image || '',
      health_status: 'healthy',
      health_score: 100,
      createdAt: now,
      updatedAt: now,
      createBy: openid,
      updateBy: openid
    };

    // Execute SQL
    const result = await app.models.$runSQL(insertPlantSQL, plantParams);

    console.log('插入结果:', result);

    // Save image record if image exists
    if (image) {
      try {
        const imgRecordId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const insertImageSQL = `
          INSERT INTO plant_images (
            _id, _openid, plantId, fileId, url, uploadedAt, createdAt
          ) VALUES (
            {{imgRecordId}}, {{openid}}, {{plantId}}, {{fileId}}, {{url}}, {{uploadedAt}}, {{createdAt}}
          )
        `;

        await app.models.$runSQL(insertImageSQL, {
          imgRecordId: imgRecordId,
          openid: openid,
          plantId: plantId,
          fileId: image,
          url: image,
          uploadedAt: now,
          createdAt: now
        });
      } catch (imgErr) {
        console.warn('保存图片记录失败:', imgErr);
      }
    }

    return {
      code: 200,
      message: '植物数据保存成功',
      data: {
        plantId: plantId,
        nickname: nickname,
        location: location,
        plantDate: plantDate,
        image: image
      }
    };

  } catch (error) {
    console.error('保存植物数据失败:', error);
    return {
      code: 500,
      message: `保存失败: ${error.message}`,
      data: null,
      stack: error.stack
    };
  }
};
```

## Key Takeaways

1. **🎯 PRIORITY: Use ORM API for simple CRUD operations** - 40% less code, automatic field management
2. **Use `$runSQL()` only for complex queries** - JOIN, GROUP BY, aggregations
3. **Include `_openid VARCHAR(64) DEFAULT '' NOT NULL` in all tables** - required for access control
4. **ORM API auto-fills `_openid`, `_id`, timestamps** - no manual management needed
5. **Handle errors gracefully** - return structured responses with error codes
6. **Use `process.env.TCB_ENV`** - automatically gets current environment ID
7. **Validate input before operations** - check required fields first
8. **Log operations for debugging** - use `console.log()` and `console.error()`

## Decision Tree: ORM API vs $runSQL()

```
Need to operate on database?
│
├─ Simple CRUD (single table)?
│  └─ ✅ Use ORM API (models.tableName.create/list/update/delete)
│
├─ Complex query (JOIN, GROUP BY, aggregation)?
│  └─ ✅ Use $runSQL() with Mustache syntax
│
└─ Relationship query (one-to-many, many-to-many)?
   └─ ✅ Use ORM API with select relationships
```

## Related Skills

- `relational-database-tool` - MCP tools for database management
- `relational-database-web` - Frontend Web SDK for MySQL
- `cloud-functions` - Cloud function deployment and configuration
- `cloudbase-platform` - General CloudBase platform knowledge

## References

- [CloudBase Models Introduction](https://docs.cloudbase.net/model/introduce)
- [CloudBase Models Initialization](https://docs.cloudbase.net/model/initialization)
- [CloudBase Data Fields](https://docs.cloudbase.net/model/data-field)
- [CloudBase Models SDK Reference](https://docs.cloudbase.net/model/sdk-reference/model)
