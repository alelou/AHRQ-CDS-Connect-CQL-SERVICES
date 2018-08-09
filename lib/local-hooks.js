'use strict';

const fs = require('fs');
const path = require('path');
const localRepo = require('./local-repo');

class Hooks {
  constructor(json={}) {
    this._json = json;
  }

  all(removeConfig=false) {
    // Clone them before returing them
    return Object.values(this._json).map(s => {
      const s2 = JSON.parse(JSON.stringify(s));
      // Remove non-standard properties, if necessary
      if (removeConfig) {
        delete(s2._config);
      }
      return s2;
    });
  }

  find(hookID) {
    let hook = this._json[hookID];
    if (hook) {
      hook = JSON.parse(JSON.stringify(hook));
    }
    return hook;
  }
}

var hooks = new Hooks();

function load(pathToFolder) {
  if (!fs.existsSync(pathToFolder) || !fs.lstatSync(pathToFolder).isDirectory()) {
    console.error(`Failed to load local hooks at: ${pathToFolder}.  Not a valid folder path.`);
    clear();
    return;
  }

  const repo = localRepo.get();
  const hooksJSON = {};
  for (const fileName of fs.readdirSync(pathToFolder)) {
    const file = path.join(pathToFolder, fileName);
    if (!file.endsWith('.json') || file == pathToFolder) {
      continue;
    }
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!json || !json.hook || !json.id || !json.description) {
      console.error(`Local hook missing required fields: ${file}`);
      continue;
    }
    if (json._config && json._config.disabled) {
      console.error(`Local hook disabled: ${file}`);
      continue;
    }
    const lib = json._config && json._config.cql ? json._config.cql.library : undefined;
    if (lib && lib.id) {
      const elm = lib.version ? repo.resolve(lib.id, lib.version) : repo.resolveLatest(lib.id);
      if (!elm) {
        console.error(`Failed to load CQL library referenced by ${json.id}: ${lib.id} ${lib.version}`);
      } else {
        json.prefetch = extractPrefetchFromELM(elm);
      }
      delete(json.library);
    }
    hooksJSON[json.id] = json;
  }
  hooks = new Hooks(hooksJSON);
}

function extractPrefetchFromELM(elm) {
  const prefetch = {};
  if (elm && elm.source && elm.source.library && elm.source.library.statements && elm.source.library.statements.def) {
    for (const expDef of Object.values(elm.source.library.statements.def)) {
      extractPrefetchFromExpression(prefetch, expDef.expression);
    }
  }
  return prefetch;
}

function extractPrefetchFromExpression(prefetch, expression) {
  if (expression && Array.isArray(expression)) {
    expression.forEach(e => extractPrefetchFromExpression(prefetch, e));
  } else if (expression && typeof expression === 'object') {
    if (expression.type === 'Retrieve') {
      const q = buildPrefetchQuery(expression);
      if (q) {
        Object.assign(prefetch, q);
      } else {
        console.error('Cannot build prefetch for Retrieve w/ dataType: ', expression.dataType);
      }
    } else {
      for (const val of Object.values(expression)) {
        extractPrefetchFromExpression(prefetch, val);
      }
    }
  }
}

function buildPrefetchQuery(retrieve) {
  const match = /^(\{http:\/\/hl7.org\/fhir\})?([A-Z][a-zA-Z]+)$/.exec(retrieve.dataType);
  if (match) {
    const resource = match[2];
    switch (resource) {
    case 'Patient':
      return { Patient: 'Patient/{{context.patientId}}' };
    case 'AllergyIntolerance':
    case 'Appointment':
    case 'AppointmentResponse':
    case 'AuditEvent':
    case 'Basic':
    case 'BodySite':
    case 'CarePlan':
    case 'Claim':
    case 'ClinicalImpression':
    case 'Communication':
    case 'CommunicationRequest':
    case 'Composition':
    case 'Condition':
    case 'Contract':
    case 'DetectedIssue':
    case 'Device':
    case 'DeviceUseRequest':
    case 'DeviceUseStatement':
    case 'DiagnosticOrder':
    case 'DiagnosticReport':
    case 'DocumentManifest':
    case 'DocumentReference':
    case 'Encounter':
    case 'EnrollmentRequest':
    case 'EpisodeOfCare':
    case 'FamilyMemberHistory':
    case 'Flag':
    case 'Goal':
    case 'ImagingObjectSelection':
    case 'ImagingStudy':
    case 'Immunization':
    case 'ImmunizationRecommendation':
    case 'Media':
    case 'MedicationAdministration':
    case 'MedicationDispense':
    case 'MedicationOrder':
    case 'MedicationStatement':
    case 'NutritionOrder':
    case 'Observation':
    case 'Order':
    case 'Person':
    case 'Procedure':
    case 'ProcedureRequest':
    case 'Provenance':
    case 'QuestionnaireResponse':
    case 'ReferralRequest':
    case 'RelatedPerson':
    case 'RiskAssessment':
    case 'Specimen':
    case 'Substance':
    case 'SupplyRequest':
    case 'SupplyDelivery':
    case 'VisionPrescription':
      return { [resource]: `${resource}?patient={{context.patientId}}` };
    case 'DeviceComponent':
      return { DeviceComponent: 'DeviceComponent?source.patient={{context.patientId}}' };
    case 'OrderResponse':
      return { OrderResponse: 'OrderResponse?request.patient={{context.patientId}}' };
    case 'Location':
    case 'Medication':
    case 'Questionnaire':
    case 'ValueSet':
      return { [resource]: resource };
    }
    // UNSUPPORTED:
    // Binary, Bundle, ClaimResponse, ConceptMap, Conformance, Coverage, DataElement, EligibilityRequest,
    // EligibilityResponse, EnrollmentResponse, ExplanationOfBenefit, Group (member?), HealthcareService,
    // ImplementationGuide, List (subject?), NamingSystem, OperationDefinition, OperationOutcome, Organization,
    // Parameters, PaymentNotice, PaymentReconciliation, Practitioner, ProcessRequest, ProcessResponse,
    // Schedule (actor?), SearchParameter, Slot, StructureDefinition, Subscription, TestScript
  }
}

function get() {
  return hooks;
}

function clear() {
  hooks = new Hooks();
}

module.exports = {load, get, clear};