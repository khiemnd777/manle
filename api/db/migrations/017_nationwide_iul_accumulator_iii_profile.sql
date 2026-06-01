do $$
declare
  v_profile_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_profile_key text := 'nationwide_iul_accumulator_iii_icc25_nwla_692';
  v_published_at timestamptz := '2026-06-01 00:00:00+00'::timestamptz;
begin
  select id
  into v_profile_id
  from illustration_profiles
  where lower(carrier) = lower('Nationwide Life and Annuity Insurance Company')
    and lower(product_name) = lower('Nationwide Indexed UL Accumulator III')
    and product_type = 'iul'
  limit 1;

  if v_profile_id is null then
    insert into illustration_profiles (
      carrier,
      product_name,
      product_type,
      status,
      notes
    ) values (
      'Nationwide Life and Annuity Insurance Company',
      'Nationwide Indexed UL Accumulator III',
      'iul',
      'active',
      'Codex-trained published profile for Nationwide Indexed UL Accumulator III form ICC25-NWLA-692.'
    )
    returning id into v_profile_id;
  else
    update illustration_profiles
    set status = 'active',
        notes = case
          when notes = '' then 'Codex-trained published profile for Nationwide Indexed UL Accumulator III form ICC25-NWLA-692.'
          when notes like '%ICC25-NWLA-692%' then notes
          else notes || E'\nCodex-trained published profile for Nationwide Indexed UL Accumulator III form ICC25-NWLA-692.'
        end,
        updated_at = now()
    where id = v_profile_id;
  end if;

  select id, version_number
  into v_version_id, v_version_number
  from illustration_profile_versions
  where profile_id = v_profile_id
    and profile_config ->> 'codexProfileKey' = v_profile_key
  limit 1;

  if v_version_id is null then
    select coalesce(max(version_number), 0) + 1
    into v_version_number
    from illustration_profile_versions
    where profile_id = v_profile_id;

    insert into illustration_profile_versions (
      profile_id,
      version_number,
      status,
      schema_version,
      min_match_score,
      min_extraction_confidence,
      profile_config,
      training_summary,
      published_at
    ) values (
      v_profile_id,
      v_version_number,
      'published',
      1,
      0.8500,
      0.8000,
      jsonb_build_object(
        'codexProfileKey', v_profile_key,
        'policyForm', 'ICC25-NWLA-692',
        'softwareVersion', '4.91.1.0 - BD',
        'profileScope', 'Nationwide Indexed UL Accumulator III non-guaranteed assumed-interest tabular detail layout'
      ),
      jsonb_build_object(
        'source', 'codex_training',
        'sampleFileName', 'Lauren Nguyen - Nationwide Indexed UL Accumulator III - 20 Pay - Monthly - User Download.pdf',
        'sampleSha256', '491fffce0670c06f65bf98c911c3930b37a3168398de0a656e1de8f475326374',
        'requiredFieldsPassed', true,
        'fingerprintsReady', true,
        'projectionRows', 92,
        'suggestedStatus', 'publish'
      ),
      v_published_at
    )
    returning id into v_version_id;
  else
    update illustration_profile_versions
    set status = 'published',
        schema_version = 1,
        min_match_score = 0.8500,
        min_extraction_confidence = 0.8000,
        profile_config = jsonb_build_object(
          'codexProfileKey', v_profile_key,
          'policyForm', 'ICC25-NWLA-692',
          'softwareVersion', '4.91.1.0 - BD',
          'profileScope', 'Nationwide Indexed UL Accumulator III non-guaranteed assumed-interest tabular detail layout'
        ),
        training_summary = jsonb_build_object(
          'source', 'codex_training',
          'sampleFileName', 'Lauren Nguyen - Nationwide Indexed UL Accumulator III - 20 Pay - Monthly - User Download.pdf',
          'sampleSha256', '491fffce0670c06f65bf98c911c3930b37a3168398de0a656e1de8f475326374',
          'requiredFieldsPassed', true,
          'fingerprintsReady', true,
          'projectionRows', 92,
          'suggestedStatus', 'publish'
        ),
        published_at = coalesce(published_at, v_published_at),
        updated_at = now()
    where id = v_version_id;
  end if;

  delete from illustration_profile_fingerprints
  where profile_id = v_profile_id
    and profile_version_id = v_version_id;

  insert into illustration_profile_fingerprints (
    profile_id,
    profile_version_id,
    fingerprint_type,
    match_strategy,
    value,
    page_hint,
    required,
    weight,
    confidence,
    evidence_snippet
  ) values
    (
      v_profile_id,
      v_version_id,
      'carrier',
      'contains',
      'Nationwide Life and Annuity Insurance Company',
      1,
      true,
      1.0000,
      0.9800,
      'Nationwide Life and Annuity Insurance Company'
    ),
    (
      v_profile_id,
      v_version_id,
      'product',
      'contains',
      'Nationwide Indexed UL Accumulator III',
      1,
      true,
      1.0000,
      0.9800,
      'Nationwide Indexed UL Accumulator III'
    ),
    (
      v_profile_id,
      v_version_id,
      'form',
      'contains',
      'Form #: ICC25-NWLA-692',
      1,
      true,
      1.0000,
      0.9400,
      'Form #: ICC25-NWLA-692'
    ),
    (
      v_profile_id,
      v_version_id,
      'text',
      'contains',
      'Indexed universal life insurance policies',
      1,
      true,
      0.7000,
      0.9000,
      'Indexed universal life insurance policies are not stock market investments'
    ),
    (
      v_profile_id,
      v_version_id,
      'version',
      'contains',
      'Software Version: 4.91.1.0 - BD',
      1,
      false,
      0.2500,
      0.7200,
      'Software Version: 4.91.1.0 - BD'
    );

  delete from illustration_profile_field_mappings
  where profile_id = v_profile_id
    and profile_version_id = v_version_id;

  insert into illustration_profile_field_mappings (
    profile_id,
    profile_version_id,
    field_path,
    source_strategy,
    source_selector,
    transform_rules,
    required,
    min_confidence,
    notes
  ) values
    (
      v_profile_id,
      v_version_id,
      'carrier',
      'constant',
      '{"value":"Nationwide Life and Annuity Insurance Company"}'::jsonb,
      '{}'::jsonb,
      true,
      1.0000,
      'Profile identity constant after required carrier/product/form fingerprints match.'
    ),
    (
      v_profile_id,
      v_version_id,
      'productName',
      'constant',
      '{"value":"Nationwide Indexed UL Accumulator III"}'::jsonb,
      '{}'::jsonb,
      true,
      1.0000,
      'Profile identity constant after required carrier/product/form fingerprints match.'
    ),
    (
      v_profile_id,
      v_version_id,
      'productType',
      'constant',
      '{"value":"iul"}'::jsonb,
      '{}'::jsonb,
      true,
      1.0000,
      'Profile identity constant after required carrier/product/form fingerprints match.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.fullName',
      'regex',
      '{"pageHint":5,"regex":"Name\\s+(?<value>[A-Z][A-Za-z .-]+?)\\s+Specified amount"}'::jsonb,
      '{}'::jsonb,
      true,
      0.9000,
      'p5: Name Lauren Nguyen.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.age',
      'regex',
      '{"pageHint":5,"regex":"Age\\s+(?<value>\\d{1,3})\\s+Death benefit"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8800,
      'p5: Age 28.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.gender',
      'regex',
      '{"pageHint":20,"regex":"Prepared For:\\s*[^/]+//\\s*(?<value>Male|Female)/\\d{1,3}/"}'::jsonb,
      '{"gender":true}'::jsonb,
      false,
      0.8600,
      'p20: Prepared For: Lauren Nguyen // Female/28/Standard Plus Nontobacco.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.state',
      'regex',
      '{"pageHint":33,"regex":"Issue State\\s+(?<value>[A-Z]{2})"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p33: Issue State TX.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.riskClass',
      'regex',
      '{"pageHint":5,"regex":"Rate Class\\s+(?<value>(?:Preferred|Standard)(?:\\s+(?:Plus|Elite))?)\\s+Nontobacco"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p5: Rate Class Standard Plus Nontobacco.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.faceAmount',
      'regex',
      '{"pageHint":5,"regex":"Specified amount\\s+\\$?(?<value>\\d[\\d,]*)"}'::jsonb,
      '{"currency":true}'::jsonb,
      true,
      0.9000,
      'p5: Specified amount $1,000,000.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.monthlyPremium',
      'regex',
      '{"pageHint":5,"regex":"Initial Premium\\s+\\$?(?<value>[\\d,.]+)"}'::jsonb,
      '{"currency":true}'::jsonb,
      true,
      0.9000,
      'p5: Initial Premium $634.25.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.premiumMode',
      'regex',
      '{"pageHint":5,"regex":"Mode\\s+(?<value>Monthly|Annual|Quarterly)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p5: Mode Monthly.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.payYears',
      'regex',
      '{"pageHint":5,"regex":"Duration\\s+(?<value>\\d{1,3})"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p5: Duration 20.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.illustratedRate',
      'regex',
      '{"pageHint":20,"regex":"1-Yr Multi-Index Monthly Avg\\s+100\\.00%\\s+Reallocate\\s+\\d+(?:\\.\\d+)?%\\s+\\d+(?:\\.\\d+)?%\\s+(?<value>\\d+(?:\\.\\d+)?)%"}'::jsonb,
      '{"percent":true}'::jsonb,
      false,
      0.8600,
      'p20: 1-Yr Multi-Index Monthly Avg 100.00% Reallocate 0.00% 2.73% 5.46%.'
    ),
    (
      v_profile_id,
      v_version_id,
      'agent.name',
      'regex',
      '{"pageHint":1,"regex":"Prepared on:\\s+[A-Za-z]+\\s+\\d{1,2},\\s+\\d{4}\\s+(?<value>[A-Z][A-Za-z .-]+?)\\s+\\d{4}\\s+[A-Za-z]"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8200,
      'p1: Prepared on: May 25, 2026 Tri Ngo.'
    ),
    (
      v_profile_id,
      v_version_id,
      'agent.phone',
      'regex',
      '{"pageHint":1,"regex":"Phone:\\s*(?<value>\\(?\\d{3}\\)?[\\s.-]*\\d{3}[\\s.-]*\\d{4})"}'::jsonb,
      '{"phone":true}'::jsonb,
      false,
      0.8200,
      'p1: Phone: (832) 403-8358.'
    );

  delete from illustration_profile_projection_mappings
  where profile_id = v_profile_id
    and profile_version_id = v_version_id;

  insert into illustration_profile_projection_mappings (
    profile_id,
    profile_version_id,
    projection_key,
    source_strategy,
    row_selector,
    column_mappings,
    value_mappings,
    transform_rules,
    required,
    min_confidence,
    notes
  ) values
    (
      v_profile_id,
      v_version_id,
      'iul_tabular_assumed_p23',
      'table',
      '{"pageHint":23,"regex":"^(?<year>\\d{1,3})\\s+(?<age>\\d{1,3})\\s+\\d[\\d,]*\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?<policyValue>[\\d,]+)\\s+(?<cashSurrenderValue>[\\d,]+)\\s+(?<deathBenefit>[\\d,]+)$"}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{"currency":true}'::jsonb,
      false,
      0.8800,
      'Captures Initial Non-Guaranteed Assumed Interest rows from page 23 only.'
    ),
    (
      v_profile_id,
      v_version_id,
      'iul_tabular_assumed_p24',
      'table',
      '{"pageHint":24,"regex":"^(?<year>\\d{1,3})\\s+(?<age>\\d{1,3})\\s+\\d[\\d,]*\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?<policyValue>[\\d,]+)\\s+(?<cashSurrenderValue>[\\d,]+)\\s+(?<deathBenefit>[\\d,]+)$"}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{"currency":true}'::jsonb,
      false,
      0.8800,
      'Captures Initial Non-Guaranteed Assumed Interest rows from page 24 only.'
    ),
    (
      v_profile_id,
      v_version_id,
      'iul_tabular_assumed_p25',
      'table',
      '{"pageHint":25,"regex":"^(?<year>\\d{1,3})\\s+(?<age>\\d{1,3})\\s+\\d[\\d,]*\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?<policyValue>[\\d,]+)\\s+(?<cashSurrenderValue>[\\d,]+)\\s+(?<deathBenefit>[\\d,]+)$"}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{"currency":true}'::jsonb,
      false,
      0.8800,
      'Captures Initial Non-Guaranteed Assumed Interest rows from page 25 only.'
    ),
    (
      v_profile_id,
      v_version_id,
      'iul_tabular_assumed_p26',
      'table',
      '{"pageHint":26,"regex":"^(?<year>\\d{1,3})\\s+(?<age>\\d{1,3})\\s+\\d[\\d,]*\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?<policyValue>[\\d,]+)\\s+(?<cashSurrenderValue>[\\d,]+)\\s+(?<deathBenefit>[\\d,]+)$"}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{"currency":true}'::jsonb,
      false,
      0.8800,
      'Captures Initial Non-Guaranteed Assumed Interest rows from page 26 only.'
    ),
    (
      v_profile_id,
      v_version_id,
      'iul_tabular_assumed_p27',
      'table',
      '{"pageHint":27,"regex":"^(?<year>\\d{1,3})\\s+(?<age>\\d{1,3})\\s+\\d[\\d,]*\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?:[\\d,]+|Lapse)\\s+(?<policyValue>[\\d,]+)\\s+(?<cashSurrenderValue>[\\d,]+)\\s+(?<deathBenefit>[\\d,]+)$"}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{"currency":true}'::jsonb,
      false,
      0.8800,
      'Captures Initial Non-Guaranteed Assumed Interest rows from page 27 only.'
    );
end $$;
